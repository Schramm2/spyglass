# Run a verification

This page describes the lifecycle of one run: start it, prove each claim,
record the result, finish and clean up. Use [commands](commands.md) for the
flags of one command and [configuration](configuration.md) for the profile.
The [terminal quickstart](quickstart.md) runs the same workflow against a demo
app.

## The workflow

```sh
spyglass init                                   # write spyglass.json; review it
spyglass up --run my-change --plan verification-plan.json --json
spyglass check verify --run my-change --claim CLAIM_ID --json   # run a check; link it to a claim
spyglass result set --run my-change --claim CLAIM_ID --outcome passed --observed "WHAT YOU SAW"
spyglass status --work --run my-change          # what each claim still needs
spyglass result --check --run my-change         # validate; record nothing
spyglass finish --run my-change --json          # result, doctor, down and report
```

`finish` runs `result`, `doctor`, `down` and `report` in order. You can run each
command alone instead. Each stage is its own step in the log. The first failed
stage stops `finish`, writes no report and exits with that stage's status; the
error says how to repair it and to run `finish` again. Add `--cleanup CHECK` to
run the owner's cleanup check (a profile check with `cleanup: true`) before
`down`. A stopped run skips `doctor` and `down`.

Add `.spyglass/` to your `.gitignore`. It holds the evidence folder.

`up --plan` writes a pending result file and prints its path. Run each step
with `--claim ID`: when the step passes, Spyglass adds its step ID and its
artifact paths to that claim in the pending file. You write only what the
operator must judge: what you observed and the outcome of each claim, with
`spyglass result set`. Check the file with `spyglass result --check`. It lists
every finding at once in `data.findings`, and each finding has a `repair`. Then
record it with `spyglass result`, which reads the pending file when you give no
`--file`. If a check fails, keep the original expectation. Repair the source
and start a new run.

## Link steps to claims

A driving command (`ui`, `api`, `db`, `check`, `exec`, `evidence add`) can link
its step to the pending result while it runs:

| Flag                    | When the step passes                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--claim ID`            | Adds the step ID and the artifacts of the step to claim `ID`. Repeat it for more claims.                         |
| `--independent-read`    | With `--claim`, sets `independentRead` of the claim to this step. Use it on the read that follows a side effect. |
| `--control ID:failed`   | Sets `failedStep` of control `ID`. The step fails on purpose, so Spyglass links it when it fails.                |
| `--control ID:restored` | Sets `restoredStep` of control `ID` and cites it in the claim of the control.                                    |
| `--gate NAME`           | Adds the step to gate `NAME` and sets its outcome to `passed`. A failed step sets `failed`.                      |

A failed step is not cited by a claim; it stays in the step log. Spyglass never
writes `observed`, the `observed` text of an inspection or the `outcome` of a
claim. You write them with `result set`:

```sh
spyglass result set --claim CLAIM_ID --outcome passed --observed "WHAT YOU SAW"
spyglass result set --claim CLAIM_ID --inspect 1280x800:ARTIFACT.png \
  --expected "WHAT SHOULD SHOW" --observed "WHAT THE IMAGE SHOWS"
spyglass result set --control CONTROL_ID --observed-failure "..." --observed-pass "..."
spyglass result set --gate GATE_NAME --outcome passed --step STEP_ID
```

An `--observed` after `--inspect` belongs to that inspection. `result set`
refuses an unknown claim, gate, control or step before it changes the file.

## See what is missing, and reuse a gate

`spyglass status --work --run ID` lists, for each claim, control and gate,
what is still missing. It uses the rules of `result --check`. A claim lists, for
example, `a passing step`, `independentRead: a later read after step 8a1f...`,
`visual inspection for screenshot 8a1f...-1-proof.png` and `observed text`.
`work.complete` is true when nothing is missing.

When an earlier run of the repository passed a planned gate on the same source
and profile, with its evidence kept and the same binding values, `up` writes
the gate into the pending result with its `run` and `steps`, and lists it in
`citedGates`. `up --cite-gates-from RUN` cites only that run and fails with
`GATE_CITATION_REJECTED` when it cannot cite a gate. `result set --gate-run RUN`
cites the planned gates of `RUN` in a run that already exists. `result` still
checks the citation.

A gate can cite another run with `run`, for example one run that executes
the repository gates for several journeys. Its steps must have passed on the
same source identity, profile and bindings as the run that records the
result.

## Shorter runs

| Command                                         | What it saves                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `up --warm [--seat SEAT]`                       | Starts the exact-origin proxy and the headless browser of a seat while the app starts. With `--seat`, it signs the seat in once the app is ready, if the seat has a login. `data.warm` shows it. If `up` fails, the warm browser and proxy close.                                                                                                                                    |
| `check a,b`, `check --gates [--concurrency N]`  | Runs checks at the same time (default 4, up to 8). Each check is its own step and keeps its artifacts; the run lock and the log stay whole. The checks must not change the source. `--gates` runs the profile checks named like the planned gates and links each to its gate.                                                                                                        |
| `ui ... --relogin`                              | When the seat's browser expired and the seat has a login, signs the seat in again, then runs the command. The step keeps the expiry in `data.relogin`.                                                                                                                                                                                                                               |
| `finish`                                        | Runs `result`, `doctor`, `down` and `report`.                                                                                                                                                                                                                                                                                                                                        |
| `replay --from RUN [--failed-only] [--execute]` | Lists, or runs again, the `check`, `exec`, `api`, `db` and `ui` steps that the claims of an earlier run cite. Each replayed step is a step of the new run, linked to the same claim. It skips a step with a masked secret, stops at the first failed step and sets `failedRun` and `failedStep` on a control that the earlier run failed. It writes no observed text and no outcome. |

`check`, `exec`, `api` and `db` read again only the source files whose size,
modification time, change time, inode or mode changed since the last full check,
and every new file. `data.sourceCheck` counts the files that they read again.
`doctor` and `report` hash every file. `doctor` also runs its independent probes
at the same time. `bench/overhead.mjs` measures the time that Spyglass adds to a
browser command; see [browser benchmark](browser-benchmark.md).

## Output and exit codes

Default output is compact, indented text for people. `--json` gives one versioned
result object on stdout and diagnostics on stderr. The two modes use the same
handler and the same exit code.

| Exit code | Meaning             |
| --------- | ------------------- |
| `0`       | Success             |
| `1`       | Failed verification |
| `2`       | Incorrect input     |
| `3`       | Environment failure |

`--run ID` selects a run across shell calls. You can also set `SPYGLASS_RUN`;
`--run` has priority. `spyglass status --run ID` shows the handoff state of a
run. Its `resultRules`, also in the output of `up`, list what this plan's claims,
controls and gates need in the result. `completedChecks.childExitCode` is the child process exit code;
`completedChecks.spyglassExitCode` is the Spyglass command exit code. A child
can exit zero while Spyglass rejects failed assertions. The earlier `exitCode`
and `commandExitCode` fields remain as aliases.

A visual result can use `inspections`, with one entry per viewport. Each entry
has `viewport`, `expected`, `observed` and `artifact`; the artifact must be a
valid screenshot from a cited step. The earlier single `inspection` remains
supported. Control templates include `failedRun`, initially the current run;
replace it when the intended failure belongs to a retained earlier run.

## Worktrees

All worktrees of a repository share their runs. Put a fault in a separate
worktree, record its failing run there, and name that run in `failedRun`.
Run `down` for the fault run in its own worktree; Spyglass refuses commands
that change a run from another worktree (`RUN_OTHER_WORKTREE`). Keep the
fault worktree until the candidate report: its evidence folder holds the
failed attempt. Run IDs are unique in the repository. If a worktree is
removed while its run is active, `status` shows `worktreeRemoved` and `down`
stops that run from any worktree.

## Review the evidence

`report` writes a checksummed Markdown summary at `data.reviewPath`, alongside
the offline HTML at `data.reportPath` and a JSON summary. `data.report.review`
names the Markdown artifact and checksum. It lists source identity,
claim/control/gate outcomes, intended failure and restored pass references,
cleanup, limits and findings. An incomplete report still writes these files and
exits 1. Each control's `recordedAttempts` lists mechanically linked attempts
separately from validated control proof; it supplies no operator observation or
passed outcome.

CI must attempt cleanup and `report` even when verification fails; `finish`
alone stops too early for that failure path. Keep local and CI proof separate,
and identify the actual checkout commit, not only the PR head. Use the
[GitHub Actions recipe](ci.md) to retain reports on success and failure.
