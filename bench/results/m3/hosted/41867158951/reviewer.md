# Final delivery: artifact-only review

## Decision and scope

**Earlier HTML and Markdown presentation fixes remain present. All artifact checksums match. No new blocking defect found in this proof.** The retained files are sufficient to identify source, intended failure, restored pass where present, cleanup and limits without source or original chat.

`passed/` supports its declared marker-fixture claim/control/gate. `incomplete/` supports intended-failure retention, not passed verification. **No overall CI status is inferred.** These files do not prove the navigation test completion repair: the only declared check is the public marker fixture. There is no retained navigation-test execution or claim here.

Reviewed supplied `passed/`, `incomplete/`, `download-audit.json`, `review-guide.md` and glossary only. No source checkout or original chat read; no verification run, agents or evidence changes. This review and screenshots are new files outside the evidence folders.

## Source and delivery identities

Both provenance files record `Schramm2/spyglass`, execution `github-actions`, event `pull_request`, workflow **41867158951**, attempt **1**.

- Tested checkout and workflow SHA: `df214f3584234feba03d8cf528ab9a4a36ad101c`.
- PR candidate head: `07ecaa6ec26ffc6d6e464bd099f5b387bc7afc1b` — **not the tested checkout commit**. The guide describes proposed-merge checkout behavior; these files cannot independently establish commit parents or current PR state.
- Baseline/current fingerprint: `83e22ea5849b586b7d71ff843b5ba8ae97c2d10e51e2474aee1218d633bb8dc4`; changed list empty. All steps within each run retain the same source identity with 808 file hashes. Fast checks report zero files rehashed.
- Node differs between scenarios: **v24.22.1 passed**, **v24.22.2 incomplete**. Thus these are not identical runtime environments; each scenario must be judged on its own record.

Compared with earlier reviewed delivery 41863511029: checkout changed from `2e7a3df7a2a227ccc08f2a84ca962f152f439364`, candidate head from `9330f4eeb618c64616157e1b1aa45e05be6005b8`, fingerprint from `f149436d3d53e0872ccb4f674d9c0fd44ec337e90a9ecdf0268a3f8d1ba85d0b`, and recorded file count from 787. No source-change content or repair outcome is inferred.

| Scenario | Download artifact ID | Name | Files |
|---|---:|---|---:|
| passed | 13341319631 | `review-proof-passed-41867158951-1` | 14 |
| incomplete | 13343715105 | `review-proof-incomplete-41867158951-1` | 13 |

Folder counts agree with audit. Audit records `metadataDigestMatched: true`, `safePaths: true`; archive SHA-256 values are `a1ad2baaa40e628c20555dd4204fa3389b46e78a3deb40e980c98880262c943c` and `e28201c764d57a955d62caac7ba7eb8e0ab6b205cdab8a934d7b916669ed11ab`. Main matched ZIP digests against GitHub; this review did not repeat the remote check.

## Selected proof and attempt trace

Selected paths come from provenance, not filename search. In each folder, `recipe.log` equals provenance, and top-level `review.md` equals its checksummed generated Markdown.

### Passed — `ci-passed-41867158951-1`

Selected under `passed/evidence/`: HTML `dab00664-aef-1-index.html`, Markdown `dab00664-aef-2-review.md`, summary `dab00664-aef-3-summary.json`.

| Operation | Current step | Previous delivery step |
|---|---|---|
| up; profile/plan retained | `5a97b5f1-e7b` | `e905621e-22a` |
| intended failed verify | `801c30cb-62e` | `61dd8a06-151` |
| restored verify | `fc4f3c30-b93` | `20a9547a-798` |
| down | `8954b2dc-617` | `70d3ea83-79d` |
| report | `dab00664-aef` | `cd717a1b-23f` |

The profile's command checks absence of `.spyglass/ci-fault`. Failed output `passed/evidence/801c30cb-62e-1-verify-output.txt` records assertion `fixture-ready: false`, overall false, detail `Intended fixture failure`. Log/command envelope retain **CHECK_FAILED**: `Check verify failed: one or more assertions failed; the structured result reports failure.` Child exit **0**, Spyglass command exit **1** — not a successful check.

Later output `passed/evidence/fc4f3c30-b93-1-verify-output.txt` records the unchanged command/assertion, assertion and overall true, detail `Fixture restored`, command exit 0. Required behavior claim `fixture-ready`, control `detect-fault` and gate `verify` cite this restored step; control failure cites `801c30cb-62e`. Links, observations, result, summary and log agree.

Observation steps: `90aba9bd-830` (claim), `3b879856-127` (control). Result recorded valid at `1a5f5622-1bb`; doctor passed at `67bee527-ff4`. Down succeeds: stopped, cleanup true. Report succeeds: complete true, passed, no findings.

### Incomplete — `ci-incomplete-41867158951-1`

Selected under `incomplete/evidence/`: HTML `e2c16c63-bbc-1-index.html`, Markdown `e2c16c63-bbc-2-review.md`, summary `e2c16c63-bbc-3-summary.json`.

| Operation | Current step | Previous delivery step |
|---|---|---|
| up; profile/plan retained | `99b50dd4-4fc` | `b0d32255-2f2` |
| intended failed verify | `5f047721-a7f` | `95c5f97f-0fe` |
| down | `0ea40c8f-d13` | `d7b1e70a-538` |
| report | `e2c16c63-bbc` | `83835514-29d` |

`incomplete/evidence/5f047721-a7f-1-verify-output.txt` retains the same false assertion/detail. Step data retains the same exact CHECK_FAILED error and child-0/Spyglass-1 distinction. Control link: `detect-fault:failed`.

Provenance explicitly records `interruption: after-intended-failure`, `problem: null`. No restored attempt or submitted result. Pending `evidence/result.json` retains failed step with blank restored step/observations. Summary claim, control and gate are `not run`, without successful citations. `recordedAttempts` preserves failed execution as an unvalidated reference.

Down succeeds: stopped, cleanup true. Report exits 1 with **REPORT_INCOMPLETE**, complete false; findings **RESULT_MISSING**, **CONTROL_INCOMPLETE**. This proves retained intended failure, not passed verification or transport failure.

Both profiles use lifecycle `none`; external owner cleanup is not required. Cleanup is the retained down response/state, not an independent process/port survey or marker-deletion check.

## Artifact checksums and consistency

Recursively checked every artifact `{path, sha256}` reference in folder JSON/JSONL, including summaries, step logs and command/report envelopes. Recomputed SHA-256 for every referenced retained artifact; checked repeated references for agreement. HTML artifact labels match checked summary digests.

| Folder | Check/config artifacts | Generated HTML/Markdown/JSON | Unique matched | Reference occurrences |
|---|---:|---:|---:|---:|
| passed | 4 | 3 | **7/7** | 42 |
| incomplete | 3 | 3 | **6/6** | 35 |

**13/13 unique artifacts, all 77 references match.** None missing, conflicting or mismatched. Generated reports, Markdown and summary digests were checked, not assumed from pre-report integrity messages. Summary self-digests are supplied by final report envelopes/log steps; pre-report 4/4 and 3/3 counts exclude generated files.

All 8 passed and 3 incomplete pre-report attempts match corresponding log fields, followed by report steps. Final command envelopes equal `report.json` except its added `code`. No individual digest is supplied for provenance, commands/recipe logs, pending result or the log file itself. Source-file hash maps are metadata, not delivered artifact references; source absence prevents independent fingerprint recomputation. Internal consistency is not author authentication.

## Actual offline browser inspection and retained fixes

Read provenance first. Opened both selected HTML files locally in new isolated session **proof-t96-41867158951**, viewport **1440×1000**, with networking offline before navigation. `navigator.onLine` was false on both. Read rendered page text, opened each failed-attempt disclosure, read its command/assertion/error data, and inspected both full-page screenshots.

- **HTML validated labels remain fixed:** “Validated failed attempt” / “Validated restored pass” are separate from recorded executions. Passed cites `801c30cb-62e` and `fc4f3c30-b93`; incomplete shows no validated proof and separately retains failed `5f047721-a7f`.
- **Visible findings remain fixed:** passed shows “No findings”; incomplete shows both exact finding codes/messages directly below the header, not hidden in a disclosure.
- **External cleanup wording remains fixed:** environment checks and detailed cleanup both say “not required”.
- **Markdown fix remains:** both generated Markdown files say “Validated intended failure” / “Validated restored pass”. Incomplete's missing validated proof is separate from its retained recorded failed step; passed citations agree with the log.

Request history contained only the two local document loads (200). No page errors returned; neither HTML had hyperlinks. Retained screenshots: `passed-browser.png` (1440×4534), `incomplete-browser.png` (1440×4018). Closed unique session; subsequent session list confirmed it absent. No other session was closed.

## Limits

No new defect found in scope. Added caution: Node patch versions differ between scenarios; these artifacts do not isolate runtime-version effects.

These reports cover the marker fixture only, **not the navigation test completion repair** or its asynchronous completion behavior. No overall CI, final required-gate, build/tool provenance, current PR or clean-source conclusion follows. Recorded source stability is not an independent source audit. Marker creation/removal has no separate retained file-operation step; command output and observations supply its evidence. It is an environment control, not product-source mutation.

Inspection establishes these two reports and their Markdown retain the fixes, not all report types, renderer cases or platforms. No human-usability, general speed, semantic coverage, database, target-application browser or arbitrary-change claim is made.
