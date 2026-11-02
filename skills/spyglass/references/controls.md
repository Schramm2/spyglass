# Controls

A **control** shows that a check detects the failure it is meant to detect: a
deliberate fault makes the check fail, then the restored target makes the same
check pass. Declare it in the plan before `up`; a control that is not in the
plan cannot be linked or recorded.

## Declare the control

Each control names its `id`, its `claim` and an `expectation`, and exactly one
proof form:

- **Assertion**: `assertion` names an assertion that a step records. The same
  assertion must fail in the failed step and pass in the restored step.
- **Command**: `command` is the exact Spyglass command and its arguments, as
  the log records them (`["exec", "--", "node", "check.mjs"]`), without
  `--json`, `--run` or link flags. `failure` gives the expected Spyglass error
  `code` and a text that the failed step's data `contains`. The failed step
  must show that failure, and the same command must pass after the restore.

A control with both forms, with neither, or with a command but no `failure`
cannot pass. `resultRules` from `up` restates each control's contract; read
it before the first attempt.

## Run the control

Make the fault in an isolated target: a fixture, a separate worktree, or an
installation that the owner creates for the control. Then:

1. Run the declared check against the fault with `--control <id>:failed`.
2. Restore the target and run the same check with `--control <id>:restored`.
3. Record what you saw:

   ```sh
   spyglass --run <run-id> result set --control <id> \
     --observed-failure "<text>" --observed-pass "<text>"
   ```

The passing restored step is linked to the control's claim. Judge that
evidence, then record the claim's outcome and observation with `result set`.

## Failure in another run

When the fault needs its own source, such as a separate Git worktree, the
failed attempt belongs to a baseline run there:

1. Start the baseline run in that worktree with a plan that declares the same
   control and the same claim expectation.
2. Run the failed attempt there, run owner cleanup for any external
   resources, then `down`.
3. In the candidate run, set the control's `failedRun` to the baseline run ID
   (`result set --control <id> --failed-run <run-id> --failed-step <step-id>`)
   and run the restored attempt there.

All worktrees of a repository share their runs. Remove the baseline worktree
only after the candidate's final report, because its evidence folder holds the
failed attempt.

The control is done when the declared assertion or command failed in the
failed step and passed in the restored step, both steps are linked, both
observations are written, and the baseline run, if any, is cleaned up with its
evidence kept.

A limit does not satisfy a declared control. If a control becomes unsafe or
unavailable, keep its row, record a limit with the reason, and expect a
blocking finding that stops the result: follow the cleanup path in step 7 of
the main skill, and report the control as a gap.
