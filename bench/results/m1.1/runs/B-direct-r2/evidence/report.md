# Verification report: demo app (run B-direct-r2)

Evidence directory: `evidence/` (repo-relative). Every action is one JSON line in
`actions.jsonl` with id, start/end time (UTC), command, exit code, stdout and stderr.
Secrets are passed by environment variable (`$DEMO_PASSWORD`, `$DEMO_TOKEN`) and any value
is replaced by `[REDACTED]` before writing; a final grep of all evidence files for both
values found no match. Helper: `step.mjs`. App log: `app.log`.

## Source identity
- Start (A01, 14:18:07Z): commit `466b14651644c01bf893c66266efaddea3bbf621`, `git status --porcelain` empty (clean).
- End (A99, 14:18:47Z): same commit, porcelain empty, check printed `UNCHANGED`.
  Ignored paths are only `evidence/` and `secrets.env`. No file under `fixtures/` was changed.

## Claims
| Claim | Expected | Observed | Actions | Outcome |
|---|---|---|---|---|
| signin-refused | page shows "Sign in failed" | after wrong password, URL /login, h1 "Sign in failed" (server returns 401) | B01, B02, B03 | PASS |
| login-dashboard | reaches /dashboard, heading "Ask a question" | URL http://127.0.0.1:47102/dashboard, h1 "Ask a question" | B04, B05, B06 | PASS |
| dashboard-mobile (visual) | heading, question field, Submit button visible, readable, not clipped at 390x844 | screenshot `dashboard-mobile.png`; innerWidth 390, scrollWidth 390; h1 x16-374, textarea x92-365, button x16-170, all inside 0-390 | V01, V02 | PASS |
| question-accepted | HTTP 202, status pending, id | HTTP 202 `{"id":"ef3aad33-3c18-42e9-a3c1-1a8807009c80","status":"pending"}` | Q01 | PASS |
| question-completed (side effect) | later separate read: complete with answer; list contains it | Q02 (14:18:36Z, ~1.2 s after POST, separate curl): HTTP 200 status complete, answer "Thanks. We received your question."; Q03 list HTTP 200 contains the id (grep count 1) | Q02, C02, Q03 | PASS |
| error-page-errors | console "fixture console error" and page error "fixture page error" reported and retained | console `[error] fixture console error`; page error `Error: fixture page error at http://127.0.0.1:47102/error:1:154` (from E02 JSON) | E01 (partial, see failed attempts), E02 | PASS |

### Screenshot inspection (dashboard-mobile.png)
I opened the PNG (390x844). It shows the bold heading "Ask a question" at top left, below it the
label "Question" with a bordered textarea to its right ending before the right edge, and a dark
green "Submit question" button with white readable text under it. Nothing is cut off at the
right edge; the rest of the page is white. Note: the label and textarea sit on one line, so the
field is narrower than the viewport; that is a layout observation, not clipping.

## Control: completion-detects-pending (claim question-completed)
Assertion: `json status=complete`.
- Deliberate failing attempt C01 (14:18:35Z): applied to the read made immediately after the POST
  (in Q01, `control-immediate.out`, HTTP 200, status `pending`). Exit 1, "observed status=pending". FAIL as intended.
- Restored passing attempt C02 (14:18:36Z): same assertion on the later read Q02 (`later.out`). Exit 0,
  "observed status=complete". PASS.
This shows the assertion can detect a pending job, so the Q02 pass is meaningful.

## Failed or partial attempts (all kept in actions.jsonl)
- C01: planned control failure, exit 1 (above).
- E01: exit 0, console error read correctly, but `errors` plain output printed only `✗ ` with no
  message, so the page error was not shown. Not counted as proof. Re-read in E02 with `--json`,
  which returned the page error text.
- X01: after `close`, `session list` still printed `→ B-direct-r2`. Re-checked in X03 (below).
- No other step failed.

## Cleanup
- X01 (14:18:45Z): `agent-browser --session B-direct-r2 close` -> "Browser closed".
- X03 (14:18:51Z): `agent-browser session list` -> "No active sessions".
- X02 (14:18:46Z): app process killed (SIGTERM), `kill -0` shows it gone, `/health` then fails
  to connect (curl exit 7, HTTP 000). App stopped.
- Temporary files `qid` and `app.pid` were removed after use.

## Limits
- From the plan: the journey proves the demo app's sign-in, dashboard, question API and error page only.
- One run, one browser (headless Chromium via agent-browser), one viewport for the visual claim.
- X03's process listing still showed an agent-browser daemon and Chromium processes. I could not
  attribute them to this session without inspecting paths outside the allowed directory; the
  session list for this state dir reports no active sessions.
- The redaction protects the known secret values only; output is not otherwise filtered.
- Q01 contains both the POST and the immediate control read in one recorded step.
