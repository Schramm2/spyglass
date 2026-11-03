# Superseded verification run

Outcome: **stopped at the user's instruction; incomplete**. No further verification was performed after the stop instruction. The coordinator's stated reason was a broken runtime and a planned fresh run; this operator did not investigate that diagnosis.

## Source identity

Start and end commit: `6062fb4699464fe945e9feea7ae9457bd84d6574`. Working tree clean at both boundaries. See `source-start.txt`, `source-end.txt`, and `steps.jsonl`. No fixtures, plans, or tracked source were modified.

## Results

| Claim / control | Outcome |
| --- | --- |
| signin-refused | Incomplete. Wrong-password submission was attempted. The immediately following browser page-state assertion failed: it still showed the login form rather than `Sign in failed`. No later read was made before cancellation. This is not proof that the app accepts wrong credentials. |
| login-dashboard | Not attempted |
| dashboard-mobile | Not attempted; no screenshot or inspection |
| question-accepted | Not attempted |
| question-completed | Not attempted; no independent read or question list |
| error-page-errors | Not attempted |
| completion-detects-pending control | Not attempted |

Readiness initially failed with a connection failure, then passed with HTTP 200. Browser version was 0.38.2. All executed driver steps, including failed attempts, retain timestamps, commands/requests, status, assertions, and output in `steps.jsonl`. `driver.mjs` is the retained driver, not evidence that its unexecuted phases occurred. Browser help is retained in `browser-help.txt`; app output is in `app.log`.

## Cleanup

At 2026-11-03T15:06:23Z, browser session `B-direct-r3` was closed successfully. A subsequent session-info read reported `active: false`, with null PID and runtime. Only owned app PID 33871 received SIGTERM. A later PID check confirmed it no longer existed, and the health request failed with `ECONNREFUSED` on port 51822. Cleanup evidence is retained in `steps.jsonl`. Evidence was preserved.

## Limits and gaps

This superseded run does not prove any of the six claims or the completion control. It covers only initial readiness, a wrong-password browser attempt and its failed immediate assertion, and cleanup. No mobile image, visual inspection, API completion evidence, later independent read, question list, or error-page evidence was collected. There are no gates in the plan. Credentials are excluded from retained records.
