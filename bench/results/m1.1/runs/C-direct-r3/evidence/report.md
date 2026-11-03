# Verification report: verification-plan.json

Raw evidence: `actions.jsonl` (every action: number, ISO time, command/request, exit/HTTP status, output; secrets redacted), `summary.json`, `run.mjs` (the script that produced them).

## Source identity
- Start (action 1): commit `ad1d3cb3a4e91ac6a8d296e183264808100ef6fb`, working tree clean (excluding ignored `evidence/`, `secrets.env`).
- End (action 12): same commit, still clean. Unchanged: yes. `check-output.json` (ignored, written by check.mjs) was removed (action 11).

## Claims
| Claim | Expected | Observed | Actions | Outcome |
|---|---|---|---|---|
| health-ready | HTTP 200, status ok | `GET /health` -> 200 `{"status":"ok"}` | 4 | PASS |
| demo-check-pass | exit 0, ok true, demo-check ok true, skips [] | exit 0, `ok:true`, demo-check ok true, `skips:[]` | 5 | PASS |

## Control: demo-check-detects-failure
- Deliberate failing attempt (action 6): `node fixtures/demo-app/check.mjs fail` -> exit 0 but `ok:false`, demo-check ok false, skips `["demo-required-case"]`. Assertion failure detected. Note: the exit code is 0 even in failure mode, so the exit code alone is not proof; the JSON is checked.
- Restored passing attempt (action 7): `check.mjs pass` -> exit 0, ok true, demo-check ok true, skips []. 
- Outcome: PASS (the assertion distinguishes fail from pass).

## Failed attempts (all kept)
- Action 2: `GET /health` before app start -> connection refused (precondition probe, expected).
- Action 6: control failing attempt (planned).
- Action 9: `GET /health` after stop -> connection refused (cleanup proof).
No unplanned failures occurred.

## Side-effect / visual claims
None in the plan; no write/read-back or screenshot was required. The browser was not used.

## Cleanup
- App (PORT=47106) stopped with SIGTERM, exit code 0 (action 8); health after stop refused (action 9); no server process (action 10).
- Browser session C-direct-r3: `agent-browser --session C-direct-r3 close` run (last line of actions.jsonl, unnumbered, output "Browser closed", exit 0).

## Limits
- Proves only the demo app's health request and demo check (plan limit).
- Single run on 127.0.0.1; no browser, side-effect or visual behavior checked.
- Password/token values are redacted; scanned below.
