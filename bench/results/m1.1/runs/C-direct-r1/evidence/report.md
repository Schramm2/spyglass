# Verification report: verification-plan.json

Raw evidence: `actions.jsonl` (each action with number, time, command or request, exit or HTTP status, output), `results.json` (derived), `run.mjs` (the script that ran them). Secret values are replaced by `[REDACTED]`.

## Source identity
- Start (actions 1-2): commit b3fedcd1b59c026b4135d2dab3ffe27b3d5805ef, `git status --porcelain --untracked-files=all` empty.
- End (actions 11-12): same commit, status empty. Unchanged: yes. (`evidence/` does not show in git status, it is ignored or excluded.)

## Claims
| Claim | Expected | Observed | Actions | Outcome |
|---|---|---|---|---|
| health-ready | HTTP 200 with status ok | HTTP 200, body {"status":"ok"} | 5 (failed pre-start attempt 3) | PASS |
| demo-check-pass | exit 0; ok true; demo-check ok true; skips [] | exit 0; ok true; demo-check ok true; skips [] | 7 | PASS |

## Control: demo-check-detects-failure
- Deliberate failing attempt, action 6 `check.mjs fail`: exit 0, ok false, demo-check ok false, skips ["demo-required-case"]. The assertion failed as intended. Note the script exits 0 even on failure, so the failure is detected from the JSON, not the exit code.
- Restored passing attempt, action 7 `check.mjs pass`: demo-check ok true. Control outcome: PASS.

## Failed attempts (all kept in actions.jsonl)
- Action 3: GET /health before the app started, ECONNREFUSED (planned negative).
- Action 6: control failing check (planned).
- Action 9: GET /health after stopping the app, ECONNREFUSED (cleanup proof).
- Readiness polling before action 5 was not logged individually.

## Side-effect / visual claims
None in the plan, so no later read-back or screenshot was needed.

## Cleanup
- App (PORT=47104, action 4) stopped with SIGTERM; exit recorded in action 8; action 9 shows the port refuses connections.
- Browser session C-direct-r1: `agent-browser --session C-direct-r1 close` exit 0 (action 10). No browser was used otherwise.
- check.mjs output file was written to `evidence/work/`, not the repo.

## Limits
- The journey proves the demo app's health request and demo check only (from the plan).
- demo-check is a fixed fixture script; it does not exercise the app over HTTP.
