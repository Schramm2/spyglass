Completed run `B-spyglass-r1`.

**Offline report:** [Open report](repo/.spyglass/runs/B-spyglass-r1/spyglass/72b74449-5e5-1-index.html)

| Claim / control | Outcome |
|---|---|
| Wrong-password sign-in refused | Passed |
| Correct sign-in reaches dashboard | Passed |
| Dashboard at 390×844 | Passed; screenshot opened and inspected |
| Question accepted with HTTP 202, pending status and ID | Passed |
| Question completes and appears in the list | Passed; separate later independent read retained |
| Error page console and page errors retained | Passed |
| Completion detects pending control | Passed; immediate assertion failed as intended, later GET passed |

Source identity remained unchanged. Failed attempts and the repaired evidence-validation attempt remain retained.

**Cleanup:** App and browser stopped; subsequent status confirmed the run is `stopped`, with no remaining work.

**Gaps:** None within the plan. Coverage is limited to the demo sign-in, dashboard, question API and error page.
