# Demo verification report

**Result: all six required claims and the control pass after retained retries.** No required claim remains unproved. No gates were specified.

## Source and run

- Source identity at start (2026-11-03T15:14:50Z) and end (15:15:35Z): `6062fb4699464fe945e9feea7ae9457bd84d6574`.
- Both working-tree checks were clean; both diff summaries empty. No tracked source, fixture or plan was changed. Evidence is Git-ignored.
- Owned app: `node fixtures/demo-app/server.mjs`, loopback port **51828**; browser **agent-browser 0.38.2**, session **B-direct-r2**; Node **v24.11.1**.
- Credentials were loaded from `secrets.env`, never copied into this report or retained command/output records. The driver redacts credential values before logging.
- Fixed plan retained as [plan.json](plan.json). Full timestamped commands/requests, outputs, command statuses and assertion outcomes: [steps.jsonl](steps.jsonl). Assertion `pass` fields, not command exit status alone, determine results.

## Claims and control

| Claim | Outcome | Evidence |
|---|---|---|
| `signin-refused` | PASS | Browser wrong-password submission, then settled heading `Sign in failed` at 15:15:14.087Z. |
| `login-dashboard` | PASS | Browser correct-password submission; settled URL `/dashboard` and heading `Ask a question` at 15:15:14.679Z. |
| `dashboard-mobile` | PASS | Viewport 390×844; [screenshot](dashboard-390x844.png), accessibility tree and element rectangles retained at 15:14:51Z. Operator opened the image with `read` before writing the inspection at 15:15:13.515Z. |
| `question-accepted` | PASS | POST `/api/questions`, bearer authentication; HTTP 202, `pending`, nonempty id at 15:14:51.412Z. Request body retained. |
| `question-completed` | PASS | Restored GET at 15:14:51.765Z returned HTTP 200, `complete`, answer. A separate later driver made an independent GET and question-list GET at 15:15:14.704–705Z; both confirmed the same completed id and answer. |
| `error-page-errors` | PASS | Browser `/error`: console retained `[error] fixture console error`; JSON page-error read retained `Error: fixture page error` and its URL/line location. Final combined assertion passed at 15:15:33.754Z. |
| Control `completion-detects-pending` | PASS | Immediate GET at 15:14:51.412Z returned HTTP 200, `pending`; assertion `json status=complete` deliberately **failed** (status 1). Restored GET after 350 ms returned `complete` with answer and passed. The failed and restored attempts both remain in the step log. |

Question id: `4f4cde0e-99cc-4ea3-bbdb-fc4a9d0f68c0`.
Answer: `Thanks. We received your question.`

### Screenshot inspection

After opening [dashboard-390x844.png](dashboard-390x844.png) with `read`, the operator observed the bold **Ask a question** heading, readable **Question** label and empty textarea, and readable green **Submit question** button, all fully inside the 390×844 image without horizontal clipping. The label sits beside the textarea near its bottom and the button wraps below. The remaining page is blank. DOM geometry independently showed scroll width 390 and all three required elements within viewport bounds.

## Failed attempts and recovery

- First health read raced startup and failed with `fetch failed`; retry returned HTTP 200 and `{"status":"ok"}`. Both retained.
- Initial sign-in assertions ran before navigation settled: both read the old `Sign in` heading (and the successful-login attempt still read `/login`). These false assertions were retained rather than overwritten. Repeating each journey with a 500 ms settle produced the required headings and URL.
- Plain-text `agent-browser errors` emitted only `✗`, so the first combined error-message assertion failed. A subsequent `--json errors` read exposed the full previously captured page error. Both the insufficient output and successful recovery remain retained.
- The immediate pending completion assertion failed deliberately, as required by the control; it is not an application failure.

## Cleanup

At 15:15:33.904Z, scoped browser close returned `closed:true` and `browserLaunched:false`. A subsequent scoped `session info --json` returned `active:false`, `pid:null`, and `runtime:null` without launching another browser. The owned app PID **41490** received SIGTERM. At 15:15:35.620Z, `kill(pid,0)` confirmed it absent; a subsequent health request failed with **ECONNREFUSED**, confirming port 51828 no longer served the app. End source identity and clean working tree were then recorded. No unrelated process listings were used.

Evidence survives cleanup. App output is in [app.log](app.log); driver scripts are [run.mjs](run.mjs), [followup.mjs](followup.mjs), and [cleanup.mjs](cleanup.mjs). Browser help is in [browser-help.txt](browser-help.txt).

## Limits

This run proves only the demo app's sign-in, dashboard at the stated phone viewport, question API and error page. The independent read used a separate later HTTP request/driver, not a database or disk inspection; the fixture stores questions in memory. It does not prove durability across restart, production security, other viewports, or the browser question-submission journey. There are no remaining required evidence gaps. This report and its relative artifacts are usable offline.
