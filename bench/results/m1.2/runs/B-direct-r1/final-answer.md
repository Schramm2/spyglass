Report: [repo/evidence/report.md](repo/evidence/report.md)

| Claim / control | Outcome |
|---|---|
| Wrong password refused | PASS |
| Correct sign-in reaches dashboard | PASS |
| Dashboard at 390×844 | PASS |
| Question API accepts submission | PASS |
| Question completes and appears in list | PASS |
| Console and page errors retained | PASS |
| Completion assertion detects pending, then passes later | PASS |

Retained evidence includes all failed attempts, later independent reads, the screenshot and post-opening inspection, and unchanged source identity at both boundaries.

**Cleanup confirmed:** app PID stopped, allocated port no longer served requests, and browser listing reported no active sessions.

**Remaining required gaps:** none. Scope limits and recovered initial failures are documented in the report.
