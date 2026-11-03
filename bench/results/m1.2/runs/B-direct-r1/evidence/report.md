# Independent demo verification report — B-direct-r1

**Overall result: PASS — six required claims and one control verified. No remaining required-evidence gap.**

Run: 2026-11-03 15:11:57–15:12:46 UTC. Local app: `http://127.0.0.1:51826`; browser session: `B-direct-r1`. No subagents or Spyglass were used. No fixtures, plan, or tracked source were modified. Credentials were inherited from `secrets.env`; retained commands and output redact credential values.

## Source identity

Start and end commit: **`6062fb4699464fe945e9feea7ae9457bd84d6574`**. At both boundaries, `git status --porcelain=v1`, `git diff --exit-code`, and `git ls-files --others --exclude-standard` returned empty output (exit 0). The evidence folder is ignored by Git. Thus the recorded source identity remained unchanged.

The fixed plan was `verification-plan.json`; terminology came from `GLOSSARY.md`. Tools reported Node v24.11.1 and agent-browser 0.38.2. The app was launched as an owned process from `fixtures/demo-app/server.mjs`, PID 38833; `/health` returned HTTP 200 with `status: ok` before journeys began.

## Claims and results

All times below are UTC on 2026-11-03. Commands, requests, start/end times, exit or HTTP status, assertion expressions, assertion results, and outputs are retained in [steps.jsonl](steps.jsonl).

| Claim | Outcome | Evidence |
|---|---|---|
| `signin-refused` | PASS | Browser opened `/login`, filled demo email and an intentionally wrong password, submitted, then read `h1` as **Sign in failed** at 15:12:27.063. |
| `login-dashboard` | PASS | Correct credential was filled in the browser and submitted. At 15:12:27.647 the URL was `/dashboard`; at 15:12:27.665 `h1` was **Ask a question**. |
| `dashboard-mobile` | PASS | Set viewport to 390×844; captured [dashboard-390x844.png](dashboard-390x844.png) at 15:11:59.135. Operator opened the image with `read` before writing [inspection.md](inspection.md). Heading, question field and Submit question button are visible/readable without horizontal clipping. Geometry reports document width 390 and all required elements within bounds. |
| `question-accepted` | PASS | Bearer-authenticated POST `/api/questions` at 15:11:59.178 returned HTTP 202, `status: pending`, and id `aaff7415-4886-421c-8761-94c59b0b53da`. |
| `question-completed` | PASS | Separate later GET at 15:11:59.533 returned HTTP 200, `status: complete`, and a nonempty answer. A new driver invocation performed a later independent HTTP read at 15:12:27.711 and a list read at 15:12:27.729; both passed, and the list contained the same completed question and answer. |
| `error-page-errors` | PASS | Browser opened `/error`; console output at 15:11:59.681 retained **fixture console error**. A later JSON errors read at 15:12:26.480 retained **Error: fixture page error** and its stack location. |

Submitted question: `B-direct-r1: Can this demo retain and complete a question?`

Completed answer: `Thanks. We received your question.`

## Control: `completion-detects-pending`

**PASS.** The immediate GET started at 15:11:59.181, immediately after the POST ended at 15:11:59.181. It returned HTTP 200 with the same id and `status: pending`. The completion assertion `status === 'complete'` evaluated **false**, deliberately demonstrating detection of incomplete processing. This failed completion assertion is retained, not converted into a success.

After a 350 ms wait, the restored GET at 15:11:59.533 returned `status: complete` and an answer; the completion assertion (with an additional answer check) passed. The independent later read and question list also passed. The control does not rely on the POST response or a browser success message as proof of completion.

## Failed attempts and recovery

All failed attempts remain in `steps.jsonl`:

- The initial wrong-password heading read at 15:11:58.997 observed **Sign in**, not **Sign in failed**. The initial correct-password URL and heading reads at 15:11:59.054 and 15:11:59.058 still observed `/login` and **Sign in**. These assertions ran before navigation settled. The subsequent dashboard snapshot already showed the expected signed-in page. Full sign-in journeys were repeated with an explicit 500 ms wait, and all expected assertions passed.
- The immediate completion read failed as required by the control, with actual `pending` output retained.
- The first plain-text page-errors read at 15:11:59.687 produced `✗` without the expected message. A later `errors --json` read retained the actual error text and stack. This establishes the required observed error, without assuming the first output proved it.
- Immediately after browser close, session listing still included `B-direct-r1` and the absence assertion failed. A later independent session listing at 15:12:46.393 reported **No active sessions** and passed. Both attempts are retained.

## Cleanup

- `agent-browser --session B-direct-r1 close` returned **Browser closed**, exit 0, at 15:12:37.248.
- Final session listing at 15:12:46.393 returned **No active sessions**, confirming browser cleanup after the initial transient listing.
- Sent SIGTERM to owned app PID 38833 at 15:12:37.382.
- At 15:12:38.784, a targeted `kill -0` check confirmed the owned PID no longer existed.
- At 15:12:38.794, curl to `/health` failed with exit 7 / connection refused, confirming the app was no longer serving the allocated port. This expected negative cleanup probe passed its assertion.
- End source identity checks passed unchanged. Evidence survived cleanup. No unrelated process listing was used. The question lived in the app's in-memory store; stopping the app disposed of that runtime state.

## Artifacts and reproducibility

- [steps.jsonl](steps.jsonl): primary chronological action and result record, including failures and cleanup.
- [driver.mjs](driver.mjs): retained driver; phases `run`, `retry`, `independent`, `cleanup`. Each invocation used the prescribed PATH and XDG_STATE_HOME and sourced `secrets.env` without printing values.
- [browser-help.txt](browser-help.txt): retained `agent-browser --help`, consulted before browser operations.
- [app.log](app.log), [app.pid](app.pid): app startup output and owned PID.
- [question-id.txt](question-id.txt): accepted question identity.
- [dashboard-390x844.png](dashboard-390x844.png), [inspection.md](inspection.md): screenshot and subsequent human/operator inspection.

Preparation used read to examine the brief, glossary, plan and app source, and used `agent-browser --help`; those preparatory reads supplied context, not acceptance proof. The screenshot was opened with read between the run and retry phases; the inspection was written only afterward. All acceptance operations are timed in the step log. This report is offline Markdown with local artifact links.

## Gates and limits

The plan names **no gates**. Its stated limit applies: this journey proves the demo app's sign-in, dashboard, question API and error page only. The independent read uses a separate HTTP request and new driver invocation plus the list endpoint; it is not a database or disk-durability check. The app stores questions in memory. This run does not prove persistence across restarts, real backend processing, comprehensive authentication security, other browsers/viewports, full accessibility, or the dashboard's form-submission journey (question submission was verified through the required API entry point).

Remaining required gaps: **none**. Initial timing and text-rendering failures are disclosed above and are not hidden by the final passing outcomes.
