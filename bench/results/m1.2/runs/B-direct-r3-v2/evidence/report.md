# Demo verification report

**Result: all six required claims PASS; control PASS.** No required claim remains unproved.

Run: B-direct-r3-v2, 2026-11-03 15:08:14–15:09:50 UTC. App: `http://127.0.0.1:53142`; browser session: `B-direct-r3-v2`; agent-browser 0.38.2. No subagents or Spyglass used.

## Source and plan

Start and end commit: `99f64721739ec1fd5acb4f38ac0744010cef174f`. Both recorded working trees and tracked diffs were empty. Fixtures, plan and tracked source were not modified. Evidence is Git-ignored. Start/end checksums match:

- `verification-plan.json`: `fc36df3b799a277603a0a3a6dea9704f4ba23749`
- `fixtures/demo-app/server.mjs`: `ab49cc3fe27dfb8473f98ea8241b21760abac143`
- `GLOSSARY.md`: `818b3c63b80debd1ec1f924962a35f38d3901e9f`

The fixed plan has no gates. Credentials were inherited from `secrets.env`; the correct password was supplied through standard input to the browser credential store, not command arguments. Bearer values and credential values are excluded from retained output. The temporary credential profile was deleted.

## Results

Each named step below is in [steps.jsonl](steps.jsonl), which retains timestamps, command/request, exit or HTTP status, assertions and output. [driver.mjs](driver.mjs) defines the exact checks, including API predicates (HTTP status, id, pending/complete and nonempty answer).

| Claim | Outcome | Evidence and observations |
|---|---|---|
| signin-refused | PASS | `wrong-email`, `wrong-password`, `wrong-submit`, `refusal-restored-read`: wrong password for agent@example.test resulted in heading **Sign in failed**. |
| login-dashboard | PASS | `retry-login-open`, `retry-login-ready`, `retry-correct-signin`, `retry-dashboard-url`, `retry-dashboard-heading`: browser signed in with the correct credential; URL `/dashboard`, heading **Ask a question**. |
| dashboard-mobile | PASS | `retry-phone-viewport`, `retry-mobile-layout`, `retry-mobile-image`; [390×844 image](dashboard-390x844.png) opened with read before writing the [inspection](inspection.md). Heading, field and Submit question button readable and not horizontally clipped; scrollWidth=390. |
| question-accepted | PASS | `question-accepted`, 15:08:15.017–.034Z: POST `/api/questions` returned HTTP 202, status pending, id `6c151454-d188-4b5f-a32e-d85b535cde69`. |
| question-completed | PASS | `control-restored-completion` at 15:08:15.338Z returned HTTP 200, complete and answer. Separate later process/read `independent-later-read` at 15:08:53.909Z again returned complete and answer; `independent-question-list` returned HTTP 200 with the same id, question, complete status and answer. These GETs read the server result rather than relying on the POST response. |
| error-page-errors | PASS | `open-error`, `error-page`, `console-errors-json`, `page-errors-json`: `/error` produced console error **fixture console error** and page error **Error: fixture page error**, including its page stack location. |

Answer observed: “Thanks. We received your question.” Question sent: “How does this demo acknowledge a question?”

## Control: completion-detects-pending

**PASS.** The same completion predicate (`HTTP 200 && status === complete`, with an answer required on restored read) was exercised against the same accepted id:

1. `control-immediate-completion`, 15:08:15.034–.035Z: immediate GET returned HTTP 200 and **pending**; completion assertion **false**, deliberately retained.
2. After a retained 300ms wait, `control-restored-completion`, 15:08:15.338–.340Z: GET returned HTTP 200 and **complete**, with answer; assertion **true**.
3. The additional independent later GET and question list passed approximately 38 seconds later.

This establishes that mere acceptance does not satisfy the completion assertion.

## Failed attempts and recovery

All failed attempts remain in the step log; none was silently replaced.

- The first browser click returned before navigation settled. The immediate refusal assertion saw the old form and failed. An overlapping return navigation failed with `net::ERR_ABORTED`; the first correct-login attempt timed out because the refusal page had no form. Initial dashboard URL/heading assertions failed. The resulting image is retained as [failed-attempt-390x844.png](failed-attempt-390x844.png), not counted as dashboard evidence. A later read confirmed refusal; a fresh login navigation with readiness and settling waits then passed the sign-in and dashboard checks.
- Plain-text `errors` returned only `✗` despite exit zero, both initially and after waiting. Its content assertions failed. `errors --json` retained the actual **fixture page error** text and stack, resolving the required evidence gap. Console JSON also passed.
- Initial browser cleanup confirmation via `session list` still showed the named session, so it was insufficient to establish browser shutdown. A follow-up `get cdp-url` probe unexpectedly launched a browser; this failed confirmation is recorded retrospectively in `confirmation-probe-relaunched`. The newly launched browser was explicitly closed again, and its captured CDP port was independently checked for refusal. This extra launch did not alter app source or claim evidence.

## Cleanup

- `delete-login-profile`: temporary `demo` credential profile deleted successfully.
- `browser-close` and later `browser-reclose`: successful **Browser closed** responses.
- `browser-cdp-confirm`, 15:09:50.166Z: HTTP request to owned browser CDP endpoint `127.0.0.1:53412/json/version` failed to connect after re-close. Browser stopped; a named CLI session entry alone was not treated as proof of a live browser.
- `app-stop`: SIGTERM sent to owned app PID 35722. `app-process-confirm`: PID no longer exists. `port-confirm`: `/health` could no longer connect after shutdown.
- End source identity and matching hashes retained. Evidence folder survives cleanup; in-memory question data disappeared with the app. No unrelated process listings were used.

## Limits and evidence index

The journey proves the demo app's sign-in, dashboard, question API and error page only. It does not prove durable storage, production security, other viewports, other users, load behavior or question submission through the dashboard UI. The independent read is an HTTP read through the app's read endpoints, not a database audit; this fixture stores questions in memory. Browser plain-text page-error rendering remains a tooling limitation, but JSON supplied the required evidence. No acceptance gap remains.

- [Step log](steps.jsonl): machine-readable actions and outputs, including failures.
- [Driver](driver.mjs): reproducible commands and predicates; no credential values.
- [Browser help](browser-help.txt): retained CLI help consulted before use (captured 15:07:27Z, successful).
- [App log](app.log), [owned app PID](app.pid), [question id](question-id.txt).
- [Initial source identity](source-start.txt), [initial tracked diff](source-start.diff); structured start/end source records also in step log.
- [Dashboard image](dashboard-390x844.png), [inspection](inspection.md), [failed image](failed-attempt-390x844.png).

All links are local; this report is readable offline.
