# Spyglass failure cases

These cases define failures that the public CLI must detect. The end-to-end
tests run the built CLI in temporary Git repositories. They test observable
results and retained evidence.

| Area | Failure case | Required result |
| --- | --- | --- |
| Input | The profile has an unsupported version or an unknown field. | The command exits with usage/profile status and names the invalid field. It does not launch the app. |
| Setup | Two profiles match the repository. | The command asks for an explicit profile through an error and next action. It does not prompt. |
| Setup | A CLI binding overrides a profile default. | Execution and retained binding records use the same resolved override. |
| Command | A command exceeds its selected deadline. | The attempt retains timeout status and output; an invalid deadline is rejected before execution. |
| Run | The app exits before its readiness check succeeds. | The run remains recorded as failed, its ID is returned, and status and cleanup remain available. |
| Run | Two operators try to change one run at once. | One mutation owns the lock. Status can inspect the active command. The second mutation fails with a recovery action. |
| Source | Source changes after the run starts. | Later evidence cannot be presented as proof for the original source. The run records both source identities or rejects the stale result. |
| Check | A check exits zero but reports a failed assertion or skipped required assertion. | The check fails and retains the command result, assertion details, skips, and artifacts. |
| Claim | A required claim has no completed step or required evidence. | The claim cannot pass. The report stays incomplete and names the missing proof. |
| Claim | A side-effect claim has no independent read after the action completes. | The claim cannot pass. |
| Evidence | An imported artifact is missing, outside an approved root, or changes during import. | The import fails and does not claim the artifact as evidence. |
| Secret | A request or page reflects a test credential. | Reports and artifacts do not expose credential values, cookies, or authorization headers. |
| Browser | A browser action targets an origin outside the profile allowlist. | The action fails with the required capability or policy named. It does not use another browser session. |
| Browser | A screenshot succeeds but a visual claim has no inspection record. | The visual claim remains incomplete. |
| Browser | An inspection for a viewport names a missing or unrelated screenshot. | The result fails and names the inspection's missing proof. |
| Operator | A child exits zero but its assertions fail. | Status names the child and Spyglass exit codes separately. Default output is readable text. |
| Output | External output contains terminal controls or a new line that resembles a Spyglass field. | Text output escapes the control bytes and keeps external content inside its field. |
| Compatibility | A version 1 result has a single inspection and no inspections array. | Both the CLI and the published schema accept the result. |
| Control | A control needs a failure from an earlier run. | The result template includes the failed run ID, which the operator can replace with the retained baseline run. |
| Control | The failed attempt ran in a separate worktree of the same repository, for an isolated fault. | The candidate's result finds the failed run by its ID. A command that changes a run from another worktree fails and names the run's worktree. If that worktree's evidence was removed, the control fails and names the missing folder. |
| Gate | A result cites a gate that passed in another run. | The gate counts only when its steps passed on this run's source identity. Otherwise the result fails and names the source mismatch. |
| Gate | A cited gate step used a binding override whose value differs from this run's: a named check against another database or API, or any step against an app that Spyglass launched with another setting. | The result fails and names the binding. A binding that the step did not use, such as an external installation's own port beside an `exec` gate, does not block the gate. |
| Browser | A `ui expect` expectation never holds, or holds only after its deadline. | The call polls until `--timeout-ms`, then fails with exit status 1. It records the last observation, the elapsed time and the polls in `expect.json`. |
| Browser | A `ui find` selector or a selector action matches no element. | The command fails with exit status 1. It includes the nearest interactive roles and labels from the current page in its error data and keeps the page snapshot. |
| Browser | A claim needs to know which element has focus. | `ui focused` records the focused element's role, label and type without its value. `--expect LABEL` fails when the label differs. |
| HTTP | A request returns an unexpected status or an asynchronous submission is checked before completion. | The expected-status check fails, or the workflow waits for completion before an independent read. |
| Database | A query attempts to write data. | Spyglass rejects it before execution. |
| Database | A query contains multiple statements, attempts to escape its transaction, or contains a psql meta-command. | PostgreSQL's extended protocol rejects multiple statements. Client meta-commands never run. No side effect occurs. |
| Database | A query returns more rows or encoded output than the supported bound. | The query fails with a clear limit and does not retain an unbounded result. |
| Database | A query returns a different row count than `--expect-rows`. | The command fails and retains the observed count and bounded result. |
| Containers | A run stops. | Spyglass stops its own processes and browser. The repository owner cleans its containers; shared services and evidence remain. |
| Report | The operator edits the result file but does not record it with `result`. | The report ignores the unrecorded file, stays incomplete with `RESULT_MISSING`, and `status` names `result` as the next command until a result is recorded. |
| Report | Required work or owner cleanup is missing. | The report files are still produced, but the run is incomplete and exits with failed-check status. |
| Claim | A step run with `--claim ID` fails, and no later step for `ID` passes. | The pending result does not cite the failed step and leaves the claim `not run`. The failed step stays in `log.jsonl`. `result` rejects a `passed` outcome for `ID` that cites it, with `FAILED_STEP`. |
| Claim | A step run with `--claim ID`, `--control ID:failed\|restored` or `--gate NAME` passes. | Spyglass adds the step and the artifacts it made to the pending result. It never writes `observed`, an inspection's `observed` or a claim `outcome`. |
| Result | `result` or `result --check` inspects a result file with multiple independent errors (for example, a missing step on claim A and a missing inspection on claim B). | Both `result` and `result --check` report all findings together in `data.findings` with the same rules and messages, and each finding has a `repair` hint. `--check` does not record the result on the run. |
| Result | `result` is run without `--file`. | Spyglass reads the pending result file of the run (`resultPath`). It does not read another file. |
| Result | `result set` is given an unknown claim, gate or control ID, or an unknown outcome. | The command exits with status 2 and names the valid IDs. It does not change the pending result. |
| Operator | A required input is missing while JSON mode is active. | Stdout contains one versioned result object, stderr contains diagnostics, and the command exits without prompting. |

Regression tests also cover these review findings. Each test failed on the CLI
before its fix:

- A rejected command must not change run state.
- A child process that exits must not use the readiness of another server.
- Spyglass must not consume a child command's `--version` argument.
- Two imported files with the same basename must not collide.
- A configured database credential that is absent must fail clearly.

The handoff test checks the command status separately from the child exit
status. It also requires a short source summary and prepared control entries.
