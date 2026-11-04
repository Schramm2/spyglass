# Guided packaging retest — complete

This is a **guided packaging retest**, not another fresh adoption and not human-use evidence. The original fresh result remains in `../SUMMARY.md` and `../public/`.

## Intervention and identity

After the fresh result, t5k reported a package-files repair for the missing adoption/support guidance. I was asked to repack the current checkout, install into another prefix, confirm both guides, read help/schema and repeat the existing control/check with new run IDs. This is one explicit developer-guided intervention after the fresh trial, not silent help during it. I made no Spyglass source edits and added no tests, helpers or fixtures.

- Candidate commit: `e8bf2130637c3bc2284b89986a862abfe6f198e9`.
- Tracked patch SHA-256 captured before pack: `6d001b08318d7f45a42c9f5890a312b58a4033e5388520018bf8b7b31855e218`.
- New installed archive SHA-256: `e4529247174b5537cbb12160ba3201759f11a6a42a611c72cdbbdb7bf4569fb2`.
- Installed CLI SHA-256: `78b68c380450109398d67bb67a154cf7754843178e4cc18e3356c6de2b8524ac` — unchanged.
- Complete installed dist manifest SHA-256: `5d15d3853c611eb0504834668421f5bca4e7e559ba25d7a5efc7058da1bf9593` — unchanged, compared byte-for-byte with the original manifest.
- Both `docs/adoption.md` and `docs/support.md` exist in the installed package. Their hashes are in `public/identity.json`.
- All three installed schemas are byte-identical to the original candidate schemas.
- Help printed: main, up, check, result, finish, report, status, down and schema. Main/check/result help and all three schemas were read again in full. Other command help was already read for the identical runtime in the fresh trial.

## Repeated proof

Target remains https://github.com/juliangruber/isarray at `8c8dd70d48ad5d0897733ca6726302a54ca9e177`. Tools are unchanged: macOS arm64, Node v24.11.1, npm 11.6.2, Git 2.56.0, Spyglass 1.3.1 candidate and Tape 5.6.1.

- New runs: `guided-m2-fault` and `guided-m2-pass`.
- Same unchanged profile, plan and `npm run tests-only` command. No new source fault or assertion changes; the existing isolated fault worktree is reused.
- Fault step `1e5de173-be5`: 28 assertions ran; the same array assertions 1, 14, 15 and 28 failed. Child and Spyglass exit 1; `CHECK_FAILED` contains the declared failure text.
- Restored step `e9789e51-0df`: 28/28 pass, no skips; child and Spyglass exit 0.
- Candidate and fault source hashes match their original fresh-run source hashes.
- `result --check` and `finish` passed on their first calls. No setup repairs, result rejections or operator errors occurred during this retest. The one intended fault failure and one expected incomplete fault report are retained.
- Both guided runs are stopped, cleanup true, with no active command. A new shell ran status and report successfully; the offline report remains complete.
- First complete guided report: `2026-11-04T14:00:27.693Z`, 78.693 seconds after the guided start. This is not a fresh-adoption time. Phase timestamps are in `public/timing.json`.

## Retention

- Complete report: `/tmp/spyglass-final-m2.6CYUpN/guided/public/pass/eaa422f0-879-1-index.html`.
- Complete summary: `public/pass/eaa422f0-879-2-summary.json`.
- Selected failed attempt and diagnostic report: `public/fault/`.
- Identity, timing and new-shell proof: `public/identity.json`, `public/timing.json`, `public/reopen-status.json`, `public/reopen-report.json`.
- Raw logs/patches: `raw/`, separate from selected public evidence and not labeled sanitized.
- Exact archive: `schramm2-spyglass-1.3.1.tgz`.
- Isolated CLI: `tool/node_modules/.bin/spyglass`.

Original artifact checksums were verified for the selected guided reports. Existing test.js, package scripts and lockfiles remain equal to HEAD. Both old and new stopped worktrees and prefixes remain for report reopening; the packaging terminal was removed. No browser, credentials, global install or publication was used.

The missing adoption/support package files are repaired in this archive. The earlier wrong-directory recovery advice, blank command-control Assertion label and target polyfill-coverage limit are not changed by this packaging-only retest. Human usability, lint, audit and legacy browsers remain untested.
