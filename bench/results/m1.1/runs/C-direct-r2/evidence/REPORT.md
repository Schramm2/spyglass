# Verification report: verification-plan.json

All actions, with their time, command or request, exit or HTTP status and output, are in
`evidence/actions.jsonl` (seq 1-14). Values of DEMO_PASSWORD and DEMO_TOKEN were redacted
at write time; a grep of every evidence file for both values found 0 matches.
App output: `evidence/app.log`. Driver script: `evidence/run.mjs`.

## Source identity
- Start (seq 1): HEAD `b3fedcd1b59c026b4135d2dab3ffe27b3d5805ef`, `git status --porcelain` empty
  (evidence/, secrets.env and check-output.json are gitignored), `git diff HEAD` sha256 e3b0c442... (empty).
- End (seq 13): identical HEAD, empty status, identical diff hash. Source did not change. No file under fixtures/ was edited.

## Claims
| Claim | Expected | Observed | Actions | Outcome |
|---|---|---|---|---|
| health-ready | HTTP 200 with status ok | HTTP 200, body `{"status":"ok"}` | seq 6 (readiness poll seq 4-5) | PASS |
| demo-check-pass | exit 0; ok true; demo-check ok true; skips [] | exit 0; ok true; demo-check ok true "the demo check passed"; skips [] | seq 7 | PASS |

## Control: demo-check-detects-failure (assertion demo-check)
- Deliberate failing attempt, `check.mjs fail` (seq 8): ok false, demo-check ok false "the demo assertion failed", skips ["demo-required-case"]. **Note: exit code was 0**; the failure is detected only from the JSON output, not the exit code.
- Restored passing attempt, `check.mjs pass` (seq 9): exit 0, ok true, demo-check ok true, skips [].
- Outcome: PASS - the assertion distinguishes fail from pass.

## Failed attempts (all kept)
- seq 2: GET /health before app start - connection refused (expected; shows no prior app on the port).
- seq 4: first readiness poll - connection refused (app still starting).
- seq 8: control's deliberate failing check (planned).
- seq 10: stop check 0.5 s after SIGTERM printed STILL-RUNNING (race); re-checked at seq 14.
- seq 11: GET /health after stop - connection refused (expected, confirms stop).

## Side-effect and visual claims
The plan contains neither, so no write/read-back and no screenshot were required. No browser was opened.

## Limits
- From the plan: the journey proves the demo app's health request and demo check only.
- check.mjs exits 0 even on failure; the verdict depends on parsing its JSON.
- check.mjs writes check-output.json in the repo root (gitignored); it is overwritten by each run, so the per-attempt outputs are kept in actions.jsonl instead.
- Seq numbers 10-13 were renumbered after the run (the cleanup phase ran in a second process and restarted at 1); the original values are kept as `original_seq`.

## Cleanup
- App (PID in app.pid) sent SIGTERM (seq 10); /health refused afterwards (seq 11); `ps -p PID` found no process (seq 14).
- Browser session C-direct-r2: `agent-browser --session C-direct-r2 close` (seq 12); `agent-browser session list` reports "No active sessions" (seq 14).
