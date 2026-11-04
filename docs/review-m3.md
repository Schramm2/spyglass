# M3 review and CI record

**Status: report artifact acceptance passed; required CI recovery in progress.**
M3 is not yet complete. [PR #28](https://github.com/Schramm2/spyglass/pull/28)
is open into `dev`. The final report artifacts passed independent review;
a separate surface-test completion repair must pass the required checks.
No release, npm publication or merge is claimed.

## Candidate and scope

The work branch is `feat/m3-review-ci`, based on `dev` at
`d3985d3bca8ecd5948d04fbb80e766a970329329`. Local checks used the uncommitted
M3 candidate on Node 24.11.1 and macOS arm64. This is not proof from a clean
released version or GitHub's proposed merge commit.

Delivered surfaces:

- Every report writes a checksummed Markdown review artifact. `reviewPath`
  selects it; `report.review` records its path/checksum. The summary includes
  source identity, claims, controls, gates, cleanup, limits and findings on
  both complete and incomplete paths.
- `controls[].recordedAttempts` retains mechanically linked references when a
  result has not been submitted. These references remain explicitly separate
  from validated control proof and operator observations.
- Command controls show their command and expected failure in the offline
  report. Long source fingerprints, commands and paths wrap at narrow widths.
- The [public CI recipe](ci.md) and executable example preserve complete and
  interrupted runs, command diagnostics and provenance. The required Actions
  job checks both scenarios. It rejects an unrelated assertion failure,
  transport/parse errors, source drift, invalid artifacts or failed cleanup.
- The recipe uses fresh local gate proof, not an automatic earlier-run gate
  citation, to keep its delivery self-contained. It changes only the pending
  gate rows before sequential driving; the fixed plan still requires the gate.

## Failure-first checks and review repairs

Existing E2E files were extended before implementation; no new test file,
helper or fixture file was added.

1. The incomplete-report check failed because no review summary existed.
   The complete-report check likewise had no review path. The command-control
   check failed on its empty Assertion display.
2. A fresh read-only agent review found four defects: the negative CI gate
   could accept an unrelated failure; the interrupted summary omitted its
   recorded failed control step; automatic Markdown links were possible; and
   invalid/truncated CLI JSON could disappear from driver diagnostics.
3. The extended incomplete-report check failed on the missing attempt
   reference. A real recipe run with an unrelated assertion demonstrated that
   the old negative gate accepted the wrong failure. A large real check output
   demonstrated that the old driver omitted the truncated check command.
4. The existing visual surface check was extended to open the generated report
   from a local file, after target cleanup, with networking offline. Its
   document-width assertion failed at 390x844 before the wrapping repair.
5. The GitHub Markdown API in GFM mode caught a remaining email autolink even
   after entity escaping. A fixed inline boundary after the escaped `@`
   repaired that demonstrated case. The rerun retained the supplied text but
   produced no links, images, scripts or injected heading. This is actual
   renderer evidence, not an inference from source escaping.

The reviewer rechecked each repair without editing files or running a build
against the active suites. It found no remaining blocking defect in those
repairs. The initial reviewer launch used an unconfigured provider and did not
run; the replacement used the main session's provider and the same model.
This is a fresh agent code review, not hosted artifact acceptance or human
usability evidence.

## Local verification

Retained public output is indexed under
[`bench/results/m3/`](../bench/results/m3/README.md). Local checks include:

- `SPYGLASS_TEST_SURFACES=1 npm test`: **114 passed, zero failures or skips**
  (89 core checks and 25 real Chromium/HTTP/PostgreSQL/Compose checks).
- `npm run format:check`, `actionlint .github/workflows/ci.yml` and
  `git diff --check` passed. A TruffleHog filesystem scan of the intended
  changes found zero verified, unknown or unverified secrets. The pre-push
  Git-history scan remains a delivery check after a commit exists.
- The public recipe's complete path exited 0. Its interrupted path exited 1,
  retained the intended failed assertion, cleaned up and generated an
  incomplete report. The interruption marker was explicit; no unexpected
  driver problem was accepted.
- The workflow's assertion block was exercised locally against both delivery
  folders, with only the execution-context expectation changed from Actions
  to local. It accepted the two declared scenarios and rejected wrong-assertion
  and truncated-JSON controls. Both rejected controls retained the check,
  successful cleanup and report attempt. This does **not** prove runner setup,
  upload, job-summary presentation or artifact download in Actions.
- Offline reports were opened in a real browser after cleanup. The complete
  desktop view and incomplete narrow view showed their stated outcomes. The
  owning surface E2E checks both desktop and narrow widths, no document-width
  overflow and zero network resources. Opened screenshots also checked the
  updated manual at 1280x800 and 390x844; the new fields and recovery guidance
  were readable without document-width overflow.
- The GitHub GFM API rendered a public malicious-text control containing HTML,
  a heading, image/link syntax, URLs and an email address. Its before/after
  output is retained separately. Rendering an API response does not create a
  PR or publish a comment, and is not proof of the hosted job-summary layout.

Reports and source identities from local runs remain in ignored evidence
folders. Their raw diagnostics can contain local paths, so they are not copied
into public Git evidence. The public record retains selected check output and
public renderer artifacts, not edited versions of checksummed run artifacts.
The build/input manifest identifies the local runtime; it is not a release
attestation.

## First hosted acceptance

[Actions run 41858307522](https://github.com/Schramm2/spyglass/actions/runs/41858307522)
passed every required job for implementation head
`561cea397b2329c799772d3a7b78313b78e9aa3e`. GitHub tested merge checkout
`3fb71f3d920c07ab453698663be4d85f36d205ec`, not that head directly. Both runs
recorded unchanged fingerprint
`7348cdb49bd41baf4f2baf2b9c312facc8b04085b8c6f4aafd7b86f77753aed4`.

The [retained hosted record](../bench/results/m3/hosted/41858307522/) contains
byte-exact artifact archives, GitHub metadata, download and internal artifact
audits, and the artifact-only review. The complete archive is artifact
`13338742077`; the interrupted archive is `13337234752`. Both archive digests
matched GitHub metadata. All 13 unique recorded artifacts matched their
checksums; the fresh reviewer independently checked 77 reference occurrences.
It opened both selected HTML files offline, after target cleanup, without
reading the source checkout or original conversation. It could identify the
tested source, intended failure, restored pass where present, cleanup and
limits. No blocking integrity or trace defect was found.

The reviewer identified three presentation ambiguities: an unvalidated failed
attempt looked absent, findings were visible only inside report data, and
external cleanup appeared both true and not required. An existing E2E check
failed on all three before the repairs: validated attempt labels, a visible
Findings section beside status, and consistent not-required cleanup text.
CodeQL also reported that the new test assertion did not match uppercase
script tags; the assertion is now case-insensitive with mixed-case input.
This was a test-coverage finding, not evidence of a production sanitization
bypass. Initial archives and review findings remain unchanged.

## Second hosted artifact review

[Run 41861617920](https://github.com/Schramm2/spyglass/actions/runs/41861617920)
tested candidate `1c0cbfc4d98d76c3ee97f2bd5da5051a443ba3a9` through merge
checkout `f045ade58d415b0eef10a78109c93ba603dea868`. The artifact-only reviewer
repeated the 13-artifact/77-reference checksum check and offline page review.
It confirmed all three HTML findings fixed, but found that the compact
Markdown still used the ambiguous unvalidated failed/restored labels. The
existing incomplete-report E2E check then failed on its missing validated
label before the Markdown repair. The generated summary now labels those
submitted-result fields as validated too. This changes no control-validation
rule or recorded-attempt status. The [unchanged second review and artifacts](../bench/results/m3/hosted/41861617920/)
retain that intermediate finding.

## Final report artifact acceptance

[Run 41863511029](https://github.com/Schramm2/spyglass/actions/runs/41863511029)
tested head `9330f4eeb618c64616157e1b1aa45e05be6005b8` through merge checkout
`2e7a3df7a2a227ccc08f2a84ca962f152f439364`. Both fixture runs recorded unchanged
fingerprint `f149436d3d53e0872ccb4f674d9c0fd44ec337e90a9ecdf0268a3f8d1ba85d0b`.
The [retained third record](../bench/results/m3/hosted/41863511029/) includes
byte-exact review and E2E archives, service metadata and digest audits, merge
parents, the unchanged artifact-only review and opened offline screenshots.

The reviewer again matched all 13 unique artifacts and 77 checksum references,
opened both selected HTML files offline without source or chat, and traced the
new source and attempts. All HTML findings and the remaining Markdown label
ambiguity were fixed. No new report defect was found. The complete fixture
passes; the interrupted fixture remains incomplete with its intended failure,
cleanup and limits. This is report acceptance, not a verdict on every CI job.

The same workflow's retained surface TAP has 24 passes and one failure in the
existing cross-port navigation control; default TAP has 89 passes, no failures
and 25 opt-in skips. The click returned while its original allowed URL was
still current, before navigation completed. The denied-service counter was
zero at the assertion. The test now awaits the existing public `--settle`
completion path before asserting the same nonzero command, exact
`BROWSER_ORIGIN_BLOCKED` error and zero denied-service requests. No browser
policy, adapter, timing budget or assertion is weakened. Original failed TAP
and report acceptance remain separate and unchanged.

GitHub reported queued jobs even after their artifacts were available; its
run conclusion later reported failure. A cancellation request against the
previous run said it was already complete while reads still showed pending.
The service's delayed states are not treated as success. Earlier run
41861617920 eventually reported every required job successful.

## Remaining real-PR acceptance

1. Verify and publish the existing surface-test completion repair.
2. Require every current-head CI check, including both Review proof entries,
   to report success. Keep actual failure output even if service status lags.
3. Check the delivered source/merge context and retain the closing record.
   The report implementation is unchanged by this test/evidence follow-up.
   Only then mark M3 complete in the roadmap.

## Limits and separate follow-ups

- Hosted report acceptance is recorded above; the current-head required CI
  checks still need confirmation after the test completion repair. Artifacts have 14-day
  service retention; byte-exact downloaded archives remain in Git. Cancellation
  and runner loss can prevent upload. The signed-out Actions page did not show
  the job summary, so its presentation is not a claimed browser check; the
  compact summaries inside the downloaded artifacts were reviewed.
- The supplied GFM payload is covered; this is not an exhaustive Markdown
  security or accessibility audit.
- The public fixture is command-only. Its ignored marker is an environment
  control, not a source-mutation control. The full surface suite checks existing
  browser/database behavior separately, not all CI adoption configurations.
- The example's complete evidence-directory copy and raw diagnostics are safe
  only for its fixed public data. Other targets must select reviewed paths;
  no runner environment, browser state or credentials belong in an upload.
- Separate maintenance work remains: GitHub reports 38 Dependabot alerts in
  the retained M2 target's `bench/results/m2/web/adoption/package-lock.json`,
  and existing CodeQL findings on `dev`. M3 adds no dependency. A successful
  CodeQL job is not a zero-finding claim. Triage source findings separately and
  use maintained dependencies for new benchmark runs; do not rewrite old proof
  to represent unverified upgrades.
- An existing generic gate-link problem remains outside the changed owner:
  linking a new local step to an automatically cited gate can retain the old
  `gate.run` while appending the new step ID. The safe generic repair is to
  replace the inherited citation with local proof when explicitly rerunning a
  gate, with an existing E2E regression first. The recipe avoids the problem
  by requesting fresh gate proof in its pending result; it does not repair
  `linkPendingResult` for other callers.
- M2's source-drift owner-cleanup problem and M1.2's browser-evidence repair
  remain separate. Historical cloud timing/first-frame failures are not
  resolved by these local correctness results.
