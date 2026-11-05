# Review proof in GitHub Actions

Use Spyglass to retain the proof for a pull request, including when verification
fails. A reviewer must be able to identify the tested source, intended failure,
restored pass, cleanup and limits without the original conversation.

This recipe uses public data and a command-only fixture. It needs Node 24 and
Git, not a browser, Docker, credentials or a hosted Spyglass service.

## Run the recipe locally

From a Spyglass source checkout:

```sh
npm ci
npm run build
node examples/ci-run.mjs passed
node examples/ci-run.mjs incomplete
```

The `passed` recipe must exit 0. The `incomplete` recipe must exit 1: it deliberately stops
after the intended failure, before the restored pass and result submission.
Both runs attempt `down` and `report`. Their evidence stays in
`.spyglass/runs/`; their delivery folders are
`.spyglass/ci-delivery/passed/` and `.spyglass/ci-delivery/incomplete/`.
Repeated local attempts keep separate run evidence; the delivery folder is a
current index and can contain earlier report files. Use `provenance.json`, not
a filename search, to select the current report.

The profile and plan are in `examples/ci.profile.json` and
`examples/ci.plan.json`. An ignored fault marker makes the same assertion fail
and then pass. This is an environment control, not a product-source mutation.
The driver clears automatic pending gate citations after `up` and reruns the
planned gate in this run, so the delivery has its own gate evidence. Result
validation still requires that planned gate; no assertion or source rule is
relaxed. The script records only the fixture observations its assertions
check. It is not an automatic semantic verdict for an arbitrary change.

## Use it in Actions

The executable recipe is the `review-proof` job in
[the CI workflow](../.github/workflows/ci.yml). It runs both scenarios on
separate Ubuntu runners. It tests the built candidate in that checkout, not an
older global installation. The final `CI required` gate requires this job.

The `incomplete` matrix entry uses `continue-on-error` only so the next step
can inspect the failed verification. A later assertion requires the expected
nonzero outcome, the explicit interruption marker, an incomplete report, the
exact failed assertion and error, stable source, artifact integrity and
successful cleanup. Unexpected driver or transport failures cannot qualify.
A setup failure, absent report or failed cleanup fails the job. The
`passed` entry requires complete claims, control and gate proof. A green
matrix entry for the negative scenario means **failure retention worked**;
it does not mean that its incomplete report passed verification.

Each entry uploads `review-proof-SCENARIO-RUN_ID-ATTEMPT` for 14 days, with:

- `review.md`: the compact claim/control/gate/limit/cleanup summary.
- `provenance.json`: execution context, checkout commit, PR head, workflow run,
  attempt, scenario, problem and relative paths to the selected report files.
- `report.json`: the report command's JSON envelope, including findings.
- `commands.json` and `recipe.log`: command outcomes, including failed attempts.
  Raw stdout/stderr, spawn errors and parse errors survive truncated JSON.
  An exact-run-ID absence check precedes `up`; an uncertain `up` still probes
  and attempts cleanup/report for only that ID.
- `evidence/`: the run's retained artifacts, step log, offline HTML report,
  JSON summary and checksummed Markdown summary.

Upload runs with `if: always()`. Before a run is allocated, no Spyglass report
can exist. In that case keep setup/job output and explicit provenance when the
script ran; do not substitute an older report. Runner loss, job cancellation
and a failure before the upload action can still prevent delivery. Artifact
retention is bounded; download evidence before expiry when a decision needs it.

### Adapt it to another repository

1. Install Spyglass from a source checkout pinned to a full commit. Build it
   with Node 24. Keep its path separate from the target. npm publication is
   disabled; a registry install is not this recipe's installation path.
2. Copy and adapt the example profile, plan and driver. Replace the fixture
   command, claim, control and observations with the target's existing check
   and fixed acceptance conditions. Keep the evidence directory Git-ignored.
   Set the driver's `cli` path to the pinned checkout's `dist/cli.js`, or keep
   the driver beside that checkout's `examples/` directory and run it from the
   target repository. Record both tool revision and target source.
3. Build the target **before** `up`. After source or build inputs change,
   start a new run. Keep assertions unchanged between a control's failure and
   restored pass. A control that changes product source needs separate fault
   and candidate runs; the ignored-marker shortcut does not prove that case.
4. In a `finally` block or separate `if: always()` steps, attempt owner cleanup
   when required, then `down`, then `report`. Keep the original verification
   failure nonzero. `finish` is useful for a passing run, but stops before
   report when an earlier stage fails. Do not use it as the only failure path.
5. Upload only reviewed evidence paths, with `if: always()` and an explicit
   retention period. Never upload the runner environment, state home, browser
   profiles, credential files or the whole target checkout. The complete
   evidence copy in this example is approved only for its public fixture.
6. Append the generated Markdown to `GITHUB_STEP_SUMMARY`. The report returns
   its absolute path as `data.reviewPath` and its checksummed artifact as
   `data.report.review`. On a failed report these fields remain in `data`.
   `data.reportPath` selects the offline HTML file.
7. Keep normal verification failures as failed jobs. The example's expected
   incomplete scenario is a deliberate check of failure delivery, not a
   general `continue-on-error` policy. Use read-only permissions, pinned action
   commits and `persist-credentials: false`. Run untrusted PR code only with
   `pull_request`, not `pull_request_target` or secrets with write authority.

For external lifecycle mode, use the owner's `cleanup: true` check before
`down`. Source drift currently blocks that named check; use the documented
owner recovery directly and keep the report incomplete. Do not bypass source
validation to get a green CI result.

## Review a real pull request

1. Open the Actions run for the PR's current candidate. Read its job summary.
   If the summary is not visible, use the downloaded `review.md` and report
   instead; the signed-out page did not show summaries in the recorded trial.
   Find the source commit, fingerprint, claims, intended failure, restored
   pass, cleanup and limits. An incomplete status is not a pass, even when
   some claims say `passed`.
2. Compare `provenance.json` with the PR and workflow run. For `pull_request`,
   the default checkout is GitHub's proposed **merge commit**; `candidateHead`
   is the PR head, and `checkoutCommit` is the tested merge result. These can
   differ. A base change can require new proof. The report's source commit
   must match `checkoutCommit`; its fingerprint also covers working-tree
   inputs. A commit ID alone is not proof of clean source.
3. Download both artifacts from the Actions run page, or use:

   ```sh
   gh run download RUN_ID --repo OWNER/REPO \
     --name review-proof-passed-RUN_ID-ATTEMPT --dir review-passed
   gh run download RUN_ID --repo OWNER/REPO \
     --name review-proof-incomplete-RUN_ID-ATTEMPT --dir review-incomplete
   ```

4. Read each `provenance.json`, then open its `report` path inside the download.
   The HTML works from a local file without the app, Spyglass state or a
   network connection. The JSON summary names artifact SHA-256 values. Keep
   the original files: editing a cited artifact invalidates its proof.
5. Trace a claim to its steps and artifacts. Check the control's intended
   failed attempt and later restored pass, not just a successful command.
   Read the visible Findings section, remaining limits and cleanup. The
   validated failed/restored labels refer to submitted control proof, not every
   recorded execution. A control's `recordedAttempts` lists
   mechanically linked steps even before result submission. These are labelled
   as unvalidated references: they do not replace operator observations or
   establish a passed control. The Markdown is an index, not a
   replacement for the detailed report or an image inspection.
6. Record the review against the exact artifact/run and candidate. State what
   the evidence cannot prove. Local runs are labelled `local` in provenance;
   they do not prove that the checks ran in CI. Neither execution proves every
   platform, semantic coverage or visual appearance without inspection.

See [the M3 evidence record](review-m3.md) for actual outcomes and remaining
completion limits. See [CI maintenance](../agent_docs/ci.md) for the repository's
other required gates and failure diagnosis.
