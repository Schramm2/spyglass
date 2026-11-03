# Verification report: demo app (session B-direct-r3)

Offline evidence: `actions.jsonl` (one JSON line per action: step, start/end UTC time, command or request, exit code, full output incl. HTTP status lines; secret values replaced by `[REDACTED_*]`), `dashboard-390x844.png`, `app.log`, `question-id.txt`, logger `act.sh`. Step ids below refer to `actions.jsonl`.

## Source identity
- Start (`source-start`, 2026-11-03 ~14:27Z): HEAD `466b14651644c01bf893c66266efaddea3bbf621` ("Demo baseline"); no modified/untracked files outside `evidence/`; empty `git diff HEAD`; fixtures sha256: server.mjs e52d8dd9..., check.mjs 79e55d15..., compose.yaml 764ed602...
- End (`source-end`): identical HEAD, identical empty status/diff, identical fixture hashes. Source unchanged. Only `evidence/` was added (untracked).

## Claims
| Claim | Expected | Observed | Steps | Outcome |
|---|---|---|---|---|
| signin-refused | Page shows "Sign in failed" | After wrong password, URL /login, h1 "Sign in failed" | signin-refused.* | PASS |
| login-dashboard | /dashboard, heading "Ask a question" | URL http://127.0.0.1:47103/dashboard, h1 "Ask a question" | login.* | PASS |
| dashboard-mobile (visual) | heading, field, button visible, not clipped at 390x844 | viewport 390, scrollWidth 390 (no horizontal overflow); h1 x 16-374, textarea x 92-365, button x 16-170, all within 0-390 | mobile.* + screenshot | PASS |
| question-accepted | HTTP 202, status pending, id | `HTTP/1.1 202 Accepted` `{"id":"061f538e-f3d8-49f1-80cb-ef35fffd03fb","status":"pending"}` | question.post | PASS |
| question-completed (side effect) | later separate read: complete + answer; list contains it | `question.later-read` (~3 s after POST, separate GET): status complete, answer "Thanks. We received your question."; `question.list` contains id (count 1) | question.later-read, control.assert-pass, question.list, question.list-contains | PASS |
| error-page-errors | console "fixture console error" and page error "fixture page error" retained | console: `[error] fixture console error`; page errors (`errors --json`): `Error: fixture page error` (x2, one per load) | errors.* | PASS (see failed attempts) |

Visual inspection (I opened `dashboard-390x844.png` with the Read tool): 390x844 image, white page; bold heading "Ask a question" at top left, fully visible; "Question" label followed by a bordered textarea that ends before the right edge; dark green "Submit question" button with white text below it, fully visible. Nothing cut off horizontally; text readable. Minor note: the label and textarea sit side by side, label baseline aligned with textarea bottom; not a clipping issue.

## Control: completion-detects-pending (claim question-completed)
- Deliberate failing attempt: `control.immediate-read` GET right after POST returned `status":"pending"`; `control.assert-fail` evaluated `json status=complete` -> "ASSERTION FAILED", exit 1.
- Restored passing attempt: `question.later-read` returned complete; `control.assert-pass` -> "ASSERTION PASSED", exit 0.
The assertion therefore can fail and does detect the pending state.

## Failed / non-conclusive attempts (all kept in actions.jsonl)
1. `control.assert-fail` exit 1 (planned control failure).
2. `errors.pageerrors` and `errors.pageerrors2`: plain `agent-browser errors` printed only `✗ ` with empty text (exit 0), so the page error message was not visible. Not counted as proof. Resolved by `errors.pageerrors-json` (message present) and independently `errors.eval-capture` (re-ran the page script with an error listener: "Uncaught Error: fixture page error").
3. `cleanup.app-stop`: `kill 6672` reported "No such process" (the pid recorded via `$!` was not alive at stop time although the app had served all requests; the cause was not determined). The port check confirms the app is not serving (see cleanup).
4. `cleanup.browser-sessions` / `cleanup.browser-sessions2`: `agent-browser session list` still lists `B-direct-r3` after two successful `close` calls ("✓ Browser closed").
5. `cleanup.port-check`: `ss` not installed; its "nothing listening" echo is NOT evidence. Replaced by `cleanup.port-check2`.

## Cleanup
- Browser: `agent-browser --session B-direct-r3 close` -> "✓ Browser closed" (twice). `cleanup.browser-procs`: no process with B-direct-r3 in its command line. Limit: `session list` still names the session (likely a stale registry entry).
- App: `cleanup.app-health` -> curl exit 7 (http=000); `cleanup.port-check2` -> 127.0.0.1:47103 ECONNREFUSED. App stopped. A separate `node fixtures/demo-app/server.mjs` process (pid 6006, older than this run, not on port 47103) exists on the host; it was not started by this run and was not touched.

## Secrets
`secret-scan`: no DEMO_PASSWORD or DEMO_TOKEN value found in evidence/. The password was typed via `fill` and the token sent via header; both redacted in logs.

## Limits
- From plan: the journey proves the demo app's sign-in, dashboard, question API and error page only.
- Mobile check covers one viewport (390x844), Chrome engine only; the login session was reused from the login-dashboard claim.
- "Readable" is judged from the screenshot by eye, not measured contrast.
- The completion read is time-based (~3 s wait), not a guarantee of completion latency.
