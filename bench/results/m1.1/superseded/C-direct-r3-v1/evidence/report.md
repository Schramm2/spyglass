# Verification report: verification-plan.json

All raw actions (UTC start/end time, command, exit status, full output) are in `actions.jsonl`; per-step output is in `steps/<id>.out`. App stdout is in `app.log`. `run.sh` is the logging wrapper (it redacts DEMO_PASSWORD/DEMO_TOKEN; a final grep found no secret values in evidence/). `check-output.json` is the file check.mjs writes (last write = step 06, pass).

## Source identity
- Start (step 01): commit `f3ce576b03e156a35fac2e8b46523c02cb70b3e2` ("Demo baseline"), `git status --porcelain` empty, no diff vs HEAD (secrets.env and evidence/ are git-ignored).
- End (step 09): same commit, status still empty, no diff. Source did not change. Nothing under fixtures/ was edited.

## Claims
| Claim | Expected | Observed | Steps | Outcome |
|---|---|---|---|---|
| health-ready | HTTP 200, status ok | `HTTP/1.1 200 OK`, body `{"status":"ok"}` (app on PORT=47106, step 02) | 02, 03 | PASS |
| demo-check-pass | exit 0; ok true; demo-check ok true; skips [] | exit 0; `ok:true`, `demo-check ok:true`, `skips:[]` | 04 (and 06) | PASS |

## Control: demo-check-detects-failure
- Deliberate failing attempt (step 05, `check.mjs fail`): `ok:false`, demo-check `ok:false` ("the demo assertion failed"), `skips:["demo-required-case"]`. The assertion detected the failure. Note: the process **exit code was 0** even in fail mode, so exit status alone would not detect it; the verdict rests on the JSON assertion.
- Restored passing attempt (step 06, `check.mjs pass`): exit 0, `ok:true`, demo-check `ok:true`, `skips:[]`.
- Outcome: control PASSED (the assertion discriminates fail vs pass).

## Failed attempts (kept)
- Step 05: planned failing control attempt (above).
- Step 07: first stop check reported `STILL RUNNING` because `kill -0` ran 1 s after SIGTERM while the server was still exiting; the same step's curl to /health already failed (exit 7, connection refused). Step 10 re-check: pid 23836 gone (`ps` empty). Its `ss` port check failed (`ss: command not found`), so its "port not listening" line is not evidence; the curl failure in step 07 is.
- No other failed attempts.

## Side-effect and visual claims
None in the plan. No write was made, so no read-back was needed; no browser screenshot was taken because no claim is visual.

## Cleanup
- App: SIGTERM to pid 23836 (step 07); /health connection refused (step 07); pid gone (step 10).
- Browser: no browser was used by any claim. `agent-browser --session C-direct-r3 close` ran (step 08). The `session list` in that step still showed C-direct-r3, probably because the close call itself started it. Step 11 `session list` reports "No active sessions".

## Limits
- From the plan: the journey proves the demo app's health request and demo check only.
- check.mjs does not contact the app. demo-check-pass proves only the script's output, not app behavior.
- The control shows that the JSON assertion detects failure, but the exit code does not.
