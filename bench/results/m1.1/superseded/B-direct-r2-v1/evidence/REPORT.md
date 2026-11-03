# Verification report: demo app (verification-plan.json)

Date: 2026-11-03 (UTC). App: `node fixtures/demo-app/server.mjs`, PORT=47102. Browser session: `B-direct-r2`.
Action log: `actions.jsonl` (one line per action: id, start/end time, command, exit code, output file).
Raw output of each action: `out/<id>.txt`. Runner: `run.sh` (redacts DEMO_PASSWORD and DEMO_TOKEN from all output;
commands reference `$DEMO_PASSWORD`/`$DEMO_TOKEN` by name only). App log: `out/app.log`.

## Source identity
- Start (`01-source-start`): commit `1729884502769abf4618926350fb70ad21fc8e68`; no tracked or untracked changes
  (only ignored `secrets.env` and `evidence/`); sha256 of fixtures/demo-app/{check.mjs,compose.yaml,server.mjs} recorded.
- End (`16-source-end`): same commit, clean status, identical fixture hashes. Unchanged. fixtures/ not modified.

## Claims
| Claim | Expected | Observed | Evidence | Outcome |
|---|---|---|---|---|
| signin-refused | Page shows "Sign in failed" | After wrong password, URL /login (POST result), h1 "Sign in failed" | 03, 04 | PASS |
| login-dashboard | Reaches /dashboard, heading "Ask a question" | URL http://127.0.0.1:47102/dashboard, h1 "Ask a question" | 05, 06 | PASS |
| dashboard-mobile (visual) | Heading, question field, Submit button visible, readable, not clipped at 390x844 | Viewport 390, scrollWidth 390 (no horizontal overflow); h1 x 16-374, textarea x 92-365, button x 16-170, all within 390 | 07, `out/dashboard-mobile.png` | PASS |
| question-accepted | HTTP 202, status pending, id | HTTP 202, `{"id":"769c4cb7-...","status":"pending"}` | 08 | PASS |
| question-completed (side effect) | Later separate read: complete with answer; list contains it | 10: GET by id HTTP 200 status complete, answer "Thanks. We received your question."; 11: GET list HTTP 200 contains the id | 10, 11 | PASS |
| error-page-errors | Console error "fixture console error" and page error "fixture page error" retained | console [error] "fixture console error"; page error "Error: fixture page error" | 12 (partial), 13 | PASS |

Screenshot inspection (`out/dashboard-mobile.png`, opened and viewed): a 390-wide phone page with the bold heading
"Ask a question" at top-left, a "Question" label followed by an empty textarea reaching nearly to the right edge,
and a dark green "Submit question" button with white text below. All three are fully visible and legible; nothing
is cut off at the right edge; no horizontal scrollbar. Minor note: the label sits inline beside the textarea, which
is a layout choice, not clipping.

## Control: completion-detects-pending (for question-completed)
- Deliberate failing attempt `09-control-immediate-read`: GET /api/questions/<id> immediately after POST returned
  status `pending`; assertion "status equals complete" FAILED (exit 1). Retained.
- Restored passing attempt `10-later-read` (~1 s later): same assertion PASSED (status complete).
- The assertion therefore detects the pending state. Control outcome: PASS.

## Failed attempts (all retained)
- `09-control-immediate-read`: exit 1, planned control failure (above).
- `12-error-page`: exit 0, but plain-text `agent-browser errors` printed only "✗" and not the page error text,
  so it is not counted as proof; re-read with `--json` in `13` showed the error. Console part of 12 did show the error.
- `15-app-stop`: kill sent; 1 s later the check printed STILL_RUNNING (process was still shutting down), while
  /health already returned 000. Re-checked in `17`/`19`.
- An unlogged first attempt of `19-port-check` failed in the runner itself (env var bug) before the command ran;
  its output was not stored; the runner was fixed and 19 re-run.

## Cleanup
- Browser: `14-browser-close` "Browser closed"; `18` `agent-browser session list` -> "No active sessions".
- App: `17` no process with our app PID 25452; /health on 47102 -> no connection (000); `19` nothing listening on 47102.
  Another `node fixtures/demo-app/server.mjs` process (PID 25102) exists on the host; it predates and is not this run's
  app (not on port 47102), so it was left alone.

## Secret check
grep of evidence/ for the DEMO_PASSWORD and DEMO_TOKEN values found no matches.

## Limits
- Per plan: proves only the demo app's sign-in, dashboard, question API and error page.
- API claims used the bearer token via curl, not the browser cookie session.
- Visual check is one viewport (390x844), one Chrome engine; readability judged by inspection and box geometry.
- Single run; the control timing relies on the ~180 ms completion delay.
