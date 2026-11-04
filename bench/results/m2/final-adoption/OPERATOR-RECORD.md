# Fresh final-candidate M2 adoption: isarray

**Outcome: complete agent adoption. Human use is untested.**

- Public target: https://github.com/juliangruber/isarray
- Target commit: `8c8dd70d48ad5d0897733ca6726302a54ca9e177` (isarray 2.0.5).
- Existing check: `npm run tests-only` → `tape test.js`. No test, helper or fixture files were added. `test.js`, package scripts and lockfiles are unchanged in both worktrees.
- Fault: a separate same-repository worktree changes only the export to return false. The original Tape assertions 1, 14, 15 and 28 fail: 24/28 pass, 4/28 fail. Spyglass and child exit 1, `CHECK_FAILED`, with the planned `not ok 1 should be truthy` text.
- Restored candidate: original product source; same check and plan, 28/28 pass, no skips, child and Spyglass exit 0.
- `result --check` passed on its first call. `finish` passed result, doctor, down and report. Both runs are stopped with cleanup true. The fault report is deliberately incomplete; its failed attempt supplies the candidate control.
- A new `/bin/bash -lc` shell ran status and report at `2026-11-04T13:53:51Z`. Status was stopped; report was complete. No browser or live app was used.

## Time

First recorded clock: `2026-11-04T13:49:00Z`.
First useful complete report: `2026-11-04T13:53:32.483Z`.
Measured interval: **272.483 seconds (4 min 32.483 sec)**.

This interval includes setup, packaging coordination, a duplicate pack, plan/profile work, both attempts and cleanup. It excludes the initial required instruction reads before the first clock. Full request-to-report time and that reading duration are unavailable, not estimated. `public/timing.json` records phase starts/ends and the clock source. Setup command bounds use output-file creation/last-write times, not invented command durations. Run steps use Spyglass timestamps.

## Candidate identity

- Source commit: `e8bf2130637c3bc2284b89986a862abfe6f198e9`.
- Tracked patch SHA-256 at source capture: `c9f7e53733db388442c6c247dafd0b899c546b94cc7afcd2c120fdb0ee12f9ce`.
- Tracked patch SHA-256 after checkout pack: `9c41b58d5a9dc2a058f254a6fa2a1c198396965f881c20209f2b366e7296c64f`.
- Tracked patch SHA-256 at retention: `27f8cd1b20fcbcfe347ff5d4ab3072275e11247b98d082cc76b5f0762dcb39b9`.
- Concurrent changes between these patch captures affect only `landing/docs/index.html`. All runtime inputs match the captured source copy. Its archive and the later checkout archive are byte-identical.
- Installed archive SHA-256: `edcd81f9f34bda4811b885ad96e26d82769cf4b0b2bd53f3290313de979ff784`.
- Installed `dist/cli.js` SHA-256: `78b68c380450109398d67bb67a154cf7754843178e4cc18e3356c6de2b8524ac`.
- Installed complete dist manifest SHA-256: `5d15d3853c611eb0504834668421f5bca4e7e559ba25d7a5efc7058da1bf9593`.
- The version is 1.3.1, but this is an unreleased candidate, not an identified release based on version alone.
- Tools: macOS arm64; Node v24.11.1; npm 11.6.2; Git 2.56.0; Tape 5.6.1.
- `public/identity.json` also records the untracked adoption/support guide hashes and both run source hashes.

## Repairs, rejected results and assistance

1. **Harness coordination, not product help:** t5k said not to rebuild checkout dist while two suites read it. I made a temporary source copy, ran `npm ci`, `npm pack` and `npm install --prefix` there. After build-clear, I ran `npm pack --pack-destination` in the actual checkout and installed that exact archive into a new isolated prefix. All adoption runs used the latter prefix. No build changed during an active run. The duplicate packs produced the same archive hash.
2. **Planned profile review, not a failed setup repair:** init proposed npm test and lint. I selected the repository's existing tests-only script as verify before up. This avoids npm pretest lint and network-backed posttest audit without changing any test or assertion. Those checks are explicit limits, not claimed gates. Added only the evidence ignore rule, profile and plan to the target setup; copied them to the fault worktree.
3. **Operator error after the complete report:** an extra fault status command ran from `/tmp`, outside the repository. It exited 2 with `NOT_REPOSITORY`. I preserved `raw/operator-cwd-error-status.json`, changed to the existing fault worktree as the recipe directs, and repeated status successfully. No Git init was performed. This did not allocate a run or change evidence.
4. Product setup failures: **0**. Result validation rejections: **0**. Intended fault failures: **1**. Expected incomplete fault-report exit: **1**. Extra operator cwd error: **1**. No source repair or assertion change was needed on the candidate.
5. Undocumented product help/interventions needed: **0**. No subagents, credentials, global install, publication or browser. No prior operator records or comparison solutions were opened. No lead instructions were awaited; independent target setup and packaging continued.

## Instructions and help read

Required checkout files: AGENTS.md, GLOSSARY.md, README.md, docs/adoption.md and docs/support.md. Also read the Git workflow for worktree operations and package.json for the build contract. Did not follow links to prior adoption/comparison records or private plans.

Target: README.md, CONTRIBUTING.md, package.json, Makefile, .gitignore, index.js and test.js. No target AGENTS.md, GLOSSARY.md or GLOSSARY-MAP.md was present outside dependencies.

Harness skills read: herdr-core and `hc --skill`, Spyglass and its controls reference, Git, codebase-recon. No delegated work or recon report was used.

CLI help reads: `--help`; `init`, `schema`, `up`, `check`, `down`, `result`, `status`, `finish`, `report` and `doctor --help`. Profile, plan and result schemas were printed and read. The result schema was read in full only after result set; the documented result flags were used, and no result file was hand-written. Raw help outputs are retained. The first help set came from the temporary prefix; its package archive is byte-identical to the final checkout-prefix package.

## Defects and limits observed

No blocking adoption defect was found. No undocumented help was needed.

- **Package guidance gap:** the archive omits docs/adoption.md and docs/support.md, although its README uses relative links to them. The required checkout reads supplied the guidance in this trial. Proposed fix: include these public guides or use public absolute links in the packaged README.
- **Wrong-directory recovery advice:** NOT_REPOSITORY suggests git init, but an existing clone needs cd to its working tree. I used the documented cd step, not that suggestion. Proposed fix: advise entry into the target repository before suggesting initialization of a new project.
- **Command-control report label:** HTML shows an empty Assertion field for a command-form control. Its observations and JSON summary preserve the command/failure contract. Proposed fix: display command, error code and expected failure text for this control form.
- **Target check coverage:** the case named only polyfill deletes Array.isArray after requiring isarray. On this runtime the native export is already selected. It does not prove the fallback branch. Proposed future target fix: isolate module loading with the native function absent before import, without weakening existing assertions. No such change was made here.
- No claim for lint, npm audit, publication, legacy browsers or human usability. Report completion proves only this selected existing check and control.

## Evidence and retention

Selected public evidence: `/tmp/spyglass-final-m2.6CYUpN/public/`.
Raw logs, patches, complete run logs and the operator error: `/tmp/spyglass-final-m2.6CYUpN/raw/`.
Installed archive: `/tmp/spyglass-final-m2.6CYUpN/checkout-pack/schramm2-spyglass-1.3.1.tgz`.
Installed CLI: `/tmp/spyglass-final-m2.6CYUpN/checkout-tool/node_modules/.bin/spyglass`.

First complete report: `public/pass/02810391-236-1-index.html`.
First complete summary: `public/pass/02810391-236-2-summary.json`.
Fault report: `public/fault/b17f1b5d-69b-1-index.html`.
Fault check output: `public/fault/74e04b43-da2-1-verify-output.txt`.
Passing output: `public/pass/c7845e28-498-1-verify-output.txt`.
New-shell output: `public/reopen-status.json` and `public/reopen-report.json`.

Only selected generated reports, summaries, cited configuration/check artifacts, fault patch, identity, timings and reopen facts enter public/. Raw logs and whole source copies are **not** labeled sanitized. Selected files were checked for personal home paths and credential markers. This is local retention, not publication or a claim of permanent external storage.
