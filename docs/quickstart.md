<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-white.png">
  <img src="assets/wordmark-black.png" alt="Spyglass" width="240">
</picture>

# Terminal quickstart

Use this disposable demo to learn the same workflow that an agent uses. It
starts a local HTTP app, records a failed assertion and a later passing check,
and keeps its report after cleanup. It does not use paid services.

## Prepare the demo

From the Spyglass checkout, copy the fixture and examples into a new temporary
repository. Keep the printed directory for the trial.

```sh
trial=$(mktemp -d /tmp/spyglass-trial.XXXXXX)
mkdir -p "$trial/fixtures"
cp -R fixtures/demo-app "$trial/fixtures/"
cp examples/demo.profile.json "$trial/spyglass.json"
cp examples/demo.plan.json "$trial/verification-plan.json"
printf '.spyglass/\n' > "$trial/.gitignore"
cd "$trial"
git init -q
git add .
git -c user.name='Spyglass Trial' -c user.email='trial@example.invalid' commit -qm 'Demo baseline'
printf '%s\n' "$trial"
```

## Start, fail and check

```sh
spyglass up --run terminal-trial --plan verification-plan.json
spyglass check deliberate-failure --run terminal-trial
spyglass check health --run terminal-trial
spyglass status --run terminal-trial
```

The deliberate check must exit 1 with `CHECK_FAILED`. The health check must
exit 0 and show `health-ready: true`. Both attempts stay in
`.spyglass/runs/terminal-trial/spyglass/log.jsonl`. Each output names its step.
The health output also names its artifact.

## Record what you observed

The step log records what happened. The result file records what it proves:
for each claim, you name the steps and artifacts that prove it. `result` checks
that those steps completed and that the artifacts exist with their checksums,
so a claim cannot pass on a statement alone. An agent normally writes this
file; in this trial, you write it.

Open `.spyglass/runs/terminal-trial/spyglass/result.json` in your editor. Set
`operator` to `human`. For `health-ready`, set `outcome` to `passed`, copy the
health step ID into `steps`, and copy its artifact path into `artifacts`.
Write your observation in `observed`.

Fill the prepared `failure-detection` entry in the top-level `controls` array.
Use the two step IDs from the failed and passing commands:

```json
{
  "id": "failure-detection",
  "failedStep": "FAILED_STEP_ID",
  "restoredStep": "HEALTH_STEP_ID",
  "observedFailure": "The deliberate check failed health-ready.",
  "observedPass": "The health response returned HTTP 200 and status ok."
}
```

Keep the existing limits. This result proves the health command and the failed
assertion check. It does not prove a UI or persistent data.

```sh
spyglass result --run terminal-trial --file .spyglass/runs/terminal-trial/spyglass/result.json
spyglass doctor --run terminal-trial
spyglass down --run terminal-trial
spyglass report --run terminal-trial
```

Open the page at `reportPath` in the `report` output. Check that it includes
both attempts, the observation, the source identity, the limit and cleanup. A
report run before cleanup must remain incomplete. Running `report` after cleanup needs no live app.

## Continue an agent's run

In a prepared trial, an agent has started the run `agent-handoff`, recorded one
check and left the run idle. Continue it without the agent's chat or shell:

```sh
spyglass status --run agent-handoff
```

Use the status output to find the completed check, its outcome and the pending
claim. Run the check that the claim still needs, record the result as in
"Record what you observed", then run `down` and `report` for `agent-handoff`.
If another operator is driving the run, Spyglass refuses your command with
`RUN_BUSY`; wait until that command finishes.

## Handoff

Open a new terminal, change to the printed trial directory, and run:

```sh
spyglass status --run terminal-trial
spyglass report --run terminal-trial --json
```

The run should remain stopped and its report should still be complete. A person
or agent can inspect it without the original shell or chat. Record any unclear
step or missing information as a usability defect.
