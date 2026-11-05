# Selected evidence: guided packaging retest

This is a developer-guided packaging retest after the original fresh adoption. It is not a fresh-adoption trial or human-use evidence.

The installed archive now includes docs/adoption.md and docs/support.md. Its complete dist manifest and all three schemas are unchanged from the original fresh candidate.

`pass/eaa422f0-879-1-index.html` is the first complete guided report. `pass/eaa422f0-879-2-summary.json` records its source, claims, control, limits and cleanup. `fault/` preserves the intended failed attempt and incomplete diagnostic report. Both attempts use the existing unchanged tests-only check: fault 24 passed/4 failed, candidate 28 passed/no skips.

`identity.json` and `timing.json` identify this package and guided run. `reopen-status.json` and `reopen-report.json` prove a complete report after cleanup in a new shell. `fault-status.json` records stopped fault resources. `installed-dist-SHA256SUMS` identifies every runtime file. `SHA256SUMS` covers this selected evidence set.

These are selected generated reports and cited artifacts, not whole raw logs or a source archive. Generated reports are unmodified and their original artifact checksums were verified. Raw data stays outside this folder and is not labeled sanitized. Human use, lint, audit and legacy-browser behavior are untested.
