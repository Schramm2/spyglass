Report: [evidence/report.md](evidence/report.md)

| Claim / control | Outcome |
|---|---|
| Wrong-password sign-in refused | PASS |
| Correct sign-in reaches dashboard | PASS |
| Dashboard fits 390×844 viewport | PASS |
| API accepts question | PASS |
| Question completes and appears in list | PASS |
| Error page console and page errors retained | PASS |
| Pending-state completion control | PASS — immediate assertion failed; later assertion passed |

Retained failed attempts, the separate later read, question list, screenshot and post-opening inspection, and cleanup evidence.

Source identity remained unchanged. The app and browser were stopped and independently checked. **No required verification gap remains.** The browser CLI’s plain-text page-error output was incomplete; JSON output supplied the required evidence.
