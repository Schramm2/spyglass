# Final-candidate M2 adoption — complete

Fresh agent adoption of https://github.com/juliangruber/isarray at `8c8dd70d48ad5d0897733ca6726302a54ca9e177`. **Human use is untested.**

- Adopted the existing `npm run tests-only` check. No new test/helper/fixture files; existing assertions, package scripts and lockfiles are unchanged.
- Same-repository fault worktree: always-false export; 28 assertions ran, 4 intended array assertions failed. Candidate: same check and plan; 28/28 passed, no skips.
- Result validation and finish passed on the first attempt. Both runs are stopped, cleanup true. A new shell reopened a complete offline report without a browser or live app.
- First measured clock: `2026-11-04T13:49:00Z`; first complete report: `2026-11-04T13:53:32.483Z`. **272.483 seconds**. Initial instruction-reading time before the first clock is unavailable; this is not full request-to-report time.
- Product setup failures: 0. Result rejections: 0. Undocumented product help: 0. One later operator cwd error was preserved and corrected. Harness build coordination caused a duplicate pack; both archives are identical. No subagents, global changes, credentials or publication.
- Candidate commit: `e8bf2130637c3bc2284b89986a862abfe6f198e9`.
- Captured tracked patch SHA-256: `c9f7e53733db388442c6c247dafd0b899c546b94cc7afcd2c120fdb0ee12f9ce`. Concurrent landing-only edits changed later patch hashes; all three captures are retained. Runtime inputs stayed identical.
- Archive SHA-256: `edcd81f9f34bda4811b885ad96e26d82769cf4b0b2bd53f3290313de979ff784`.
- Installed CLI SHA-256: `78b68c380450109398d67bb67a154cf7754843178e4cc18e3356c6de2b8524ac`.
- Complete installed dist manifest SHA-256: `5d15d3853c611eb0504834668421f5bca4e7e559ba25d7a5efc7058da1bf9593`.
- macOS arm64; Node v24.11.1; npm 11.6.2; Git 2.56.0; Spyglass 1.3.1 candidate; Tape 5.6.1.

## Evidence

All paths below are under `/tmp/spyglass-final-m2.6CYUpN/`:

- `public/pass/02810391-236-1-index.html` — first complete report.
- `public/pass/02810391-236-2-summary.json` — source, claim, control, limits and cleanup.
- `public/fault/` — failed report, cited output and source identity.
- `public/reopen-status.json`, `public/reopen-report.json` — new-shell proof.
- `public/identity.json`, `public/timing.json`, `public/installed-dist-SHA256SUMS` — identity and measured phases.
- `OPERATOR-RECORD.md` — every help read, repair, assistance, command outcome and observed issue.
- `raw/` — separate raw logs and patches; **not labeled sanitized**.
- `checkout-pack/schramm2-spyglass-1.3.1.tgz` — exact installed archive.

Selected artifact checksums were verified. Temporary build copy, unused prefix and duplicate archive were removed. Final prefix and stopped candidate/fault worktrees remain to permit repeatable report reopening. No Spyglass source edits were made; the authorized prepack build ran after build-clear.

Non-blocking issues: packaged README links to adoption/support files absent from the archive; NOT_REPOSITORY suggests Git init instead of first suggesting cd; command-form controls show an empty Assertion field in HTML. Proposed fixes and evidence are in OPERATOR-RECORD.md. The target's named polyfill case does not prove fallback execution on this runtime. Lint, audit, legacy browsers and human usability are not claimed.
