Completed run `B-spyglass-r3-v2`. The offline report is **complete and passed**.

**Report:** `/tmp/m12/B-spyglass-r3-v2/repo/.spyglass/runs/B-spyglass-r3-v2/spyglass/311d43e2-aee-1-index.html`

| Claim / control | Outcome |
|---|---|
| Wrong-password sign-in refused | Passed |
| Correct sign-in reaches dashboard | Passed |
| Dashboard at 390×844 | Passed; screenshot opened and inspection recorded |
| Question accepted with HTTP 202, pending status and ID | Passed |
| Question completes and appears in the list | Passed; separate later independent read retained |
| Console and page errors reported | Passed |
| Completion detects pending control | Passed; immediate GET failed the completion assertion, later GET passed it |

Source identity was unchanged from start to finish. All failed attempts, including initial evidence-validation failures and their repairs, remain retained.

Cleanup completed; Spyglass confirmed the run stopped after shutting down its app and browser.

**Gaps:** None within the plan. Coverage is limited to the demo sign-in, dashboard, question API and error page.
