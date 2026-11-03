# Verification report: demo app (verification-plan.json)

Evidence directory: this folder. Every action is in `actions.jsonl` (one JSON record per action: id, claim, start/end time UTC, exact command, exit code, stdout, stderr). The commands reference `$DEMO_PASSWORD` / `$DEMO_TOKEN` by name, and the output is redacted; a grep for both values over every evidence file found none. `step.mjs` is the recorder. `app.log` is the app's output. `dashboard-mobile.png` is the screenshot.

## Source identity
- Start (`source-start`, 2026-11-03T14:24:45Z): HEAD `8e454b91136c24364c5b3fee2605c6001d7f2006`. Clean working tree outside `evidence/` (no porcelain status, no diff). Hash of the `fixtures` index entries: `a81feac7…a7a29e`.
- End (`source-end`): the same HEAD, the same empty status and diff, and the same fixtures hash, so the source did not change. Nothing under fixtures/ was edited. The only new untracked path is `evidence/`.

## Claims
| Claim | Expected | Observed (action ids) | Outcome |
|---|---|---|---|
| signin-refused | Page shows "Sign in failed" | Opened /login, filled agent@example.test and a wrong password, submitted. `b-check-refused`: url /login, h1 "Sign in failed" | PASS |
| login-dashboard | Reaches /dashboard, heading "Ask a question" | Correct password from env. `b-check-dashboard`: url /dashboard, h1 "Ask a question" | PASS |
| dashboard-mobile (visual) | Heading, question field and Submit button visible, readable, not clipped horizontally | `m-viewport` set 390x844 on /dashboard. `m-geometry`: innerWidth 390 = scrollWidth 390 (no horizontal overflow). h1 x 16–374, textarea x 92–365, button x 16–170, all inside 390 and in the first 233px. `m-screenshot` saved dashboard-mobile.png. I opened the image and inspected it: the bold heading "Ask a question" is fully visible at the top left; the "Question" label sits beside an empty textarea whose right edge ends before the screen edge; a dark-green "Submit question" button with white, readable text is below it; nothing is cut off; the rest of the page is blank white. | PASS |
| question-accepted | HTTP 202, status pending, id | `api-post`: HTTP 202 `{"id":"ab8d607b-…c855","status":"pending"}`. Extra: `api-noauth` without a token gives HTTP 401 | PASS |
| question-completed (side effect) | A later separate read shows complete with an answer; the list contains it | `control-pass` (separate GET about 2s after the POST): HTTP 200 status complete, answer "Thanks. We received your question."; `api-list`: GET /api/questions contains the id (count 1) | PASS |
| error-page-errors | Console "fixture console error" and page error "fixture page error" reported and retained | `e-console`: `[error] fixture console error`. `e-errors` (plain text) printed only "✗" with no error text, a FAILED/inconclusive read that is kept. `e-errors-json` and the retry `e-reopen` (fresh load, `--json`) report "Error: fixture page error" and the console message | PASS (after the retry; the first read failed) |

## Control: completion-detects-pending (claim question-completed)
- Deliberate failing attempt `control-fail`: GET /api/questions/<id> right after the POST gives status `pending`, the assertion `status=complete` prints `ASSERT FAIL status=pending`, exit 1.
- Restored passing attempt `control-pass`: a later read gives status `complete`, `ASSERT PASS`, exit 0.
So the assertion can detect a pending job.

## Failed attempts (all kept in actions.jsonl)
1. `control-fail`: planned control failure (exit 1).
2. `e-errors`: unplanned. `agent-browser errors` in text mode printed "✗" with no error text even though the error was captured; the `--json` form shows it.
3. In `e-reopen`, `agent-browser errors --clear` printed "✗" and did not clear (the next list shows the page error twice: one from the first load, one from the reload). This is an unplanned tool quirk. The retained evidence still has the error from the fresh load.
4. In `cleanup-app`, `kill -0` printed "No such process" after the kill. That is the expected sign that the app had stopped, not a failure.

## Cleanup
- `cleanup-browser`: `agent-browser --session B-direct-r1 close` printed "Browser closed". The session list printed right after still named B-direct-r1. `cleanup-browser-recheck` (2s later) and `cleanup-port-check` show "No active sessions".
- `cleanup-app`: the app process (pid in app.pid) was killed and is no longer running. GET /health on port 47101 returns 000 (connection refused).
- Other demo-app and chromium processes are still on the host. They started before this run (lower PIDs, not on port 47101) and belong to other runs, so I did not touch them.

## Limits
- From the plan: the journey proves the demo app's sign-in, dashboard, question API and error page only.
- The run used one wrong password value and one question. The visual check is a single 390x844 Chromium headless render.
- The browser sign-in proves the UI flow, and the question was sent through the API with a bearer token, not the dashboard form.
- The timestamps come from this host's clock.
