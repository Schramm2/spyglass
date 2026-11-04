# Downloaded proof review

## Decision and scope

The evidence is sufficient to identify the tested source, intended failure, restored pass where present, cleanup record and limits without source or chat. `passed/` proves the declared public fixture claim and its control. `incomplete/` proves failure retention, not a passed verification. Neither proves the PR as a whole.

Reviewed only the supplied proof folders, `download-audit.json` and `review-guide.md` (plus the supplied glossary for terms). No source checkout or original conversation was read. No verification run, evidence change or agent was started.

## Exact identities

Both `provenance.json` files and their identical `recipe.log` copies record:

- Repository: `Schramm2/spyglass`; execution: `github-actions`; event: `pull_request`.
- Workflow run `41858307522`, attempt `1`; Node `v24.22.2`.
- Tested checkout and workflow SHA: `3fb71f3d920c07ab453698663be4d85f36d205ec`.
- PR `candidateHead`: `561cea397b2329c799772d3a7b78313b78e9aa3e` — **not the tested checkout commit**. The guide explains the proposed merge checkout. These files alone cannot establish its parents or the current PR head.
- Baseline and current source fingerprint: `7348cdb49bd41baf4f2baf2b9c312facc8b04085b8c6f4aafd7b86f77753aed4`; changed list empty.

All logged steps in each run carry the same source identity and 751-file hash map. This supports recorded source stability, not an independent source audit: source files are absent, so their hashes and the fingerprint cannot be recomputed here. Check steps report fast source checks with zero files rehashed.

`download-audit.json` identifies artifact `13338742077`, `review-proof-passed-41858307522-1` (14 files), and artifact `13337234752`, `review-proof-incomplete-41858307522-1` (13 files). Folder file counts agree. Archive digests are supplied metadata; archives and remote Actions state were outside this review.

## Attempt and result trace

### Passed: `ci-passed-41858307522-1`

Selected by `passed/provenance.json`:

- HTML: `passed/evidence/c648d4b8-abd-1-index.html`.
- Summary: `passed/evidence/c648d4b8-abd-3-summary.json`.
- Generated Markdown: `passed/evidence/c648d4b8-abd-2-review.md`.

The retained profile and plan come from `up` step `8dc18f09-643`. The command checks only whether `.spyglass/ci-fault` is absent.

- Intended failure: `check verify`, step `a12f1e6c-e18`, linked to `detect-fault:failed`. Assertion `fixture-ready` is `false`, detail `Intended fixture failure`, overall `false`. Error: `CHECK_FAILED` — `Check verify failed: one or more assertions failed; the structured result reports failure.` Child exit is **0**, but Spyglass command exit is **1**. Output: `passed/evidence/a12f1e6c-e18-1-verify-output.txt`.
- Restored pass: same command and assertion, later step `e40472b9-9a8`; assertion and overall `true`, detail `Fixture restored`, command exit 0. Output: `passed/evidence/e40472b9-9a8-1-verify-output.txt`.
- Required behavior claim `fixture-ready`, control `detect-fault` and gate `verify` cite this restored step. Control cites the preceding failed step. Links and operator observations agree with `passed/evidence/result.json`, summary and log.
- Claim observation step `3c6d9be1-3c0`; control observation step `ccc281a9-ad2`; result recorded and valid at `9eabbeb5-ea2`; doctor passes at `79983ec4-475`.
- `down` step `46ddfcce-12d` succeeds, state `stopped`, cleanup true. Report step `c648d4b8-abd` succeeds: complete true, status passed, no findings.

This proves detection and restoration of the environment-marker fixture. It does not prove product-source mutation detection or other repository gates.

### Incomplete: `ci-incomplete-41858307522-1`

Selected by `incomplete/provenance.json`:

- HTML: `incomplete/evidence/c69af182-ddc-1-index.html`.
- Summary: `incomplete/evidence/c69af182-ddc-3-summary.json`.
- Generated Markdown: `incomplete/evidence/c69af182-ddc-2-review.md`.

`up` step `afc11ef6-fba` retains the profile and same plan. Failed `check verify` step `d1a16267-070` retains the same false `fixture-ready` assertion, detail, `CHECK_FAILED` error and child-0/Spyglass-1 distinction as above. Output: `incomplete/evidence/d1a16267-070-1-verify-output.txt`. It links to `detect-fault:failed`.

Provenance explicitly records `interruption: after-intended-failure`, `problem: null`. There is **no restored attempt or submitted result**. The pending `evidence/result.json` retains `failedStep`, but blank observations and restored step. Summary claim, control and gate are `not run`, with no successful citations. `recordedAttempts` correctly preserves the failed step as an unvalidated reference.

`down` step `84e14d04-3a4` succeeds, stopped and cleanup true. Report step `c69af182-ddc` exits 1 with `REPORT_INCOMPLETE`; complete false. Findings are `RESULT_MISSING` and `CONTROL_INCOMPLETE`. This is an expected incomplete record, not transport failure or a pass.

Both profiles use lifecycle mode `none`; external owner cleanup is **not required**. Cleanup proves the retained Spyglass state and successful `down`, not an independent process/port survey or deletion of the marker.

## Checksum review

Recomputed SHA-256 for every retained artifact reference found recursively in folder JSON and JSONL records, including summary, command envelopes, report envelopes and step logs:

| Folder | Recorded check/configuration artifacts | Generated HTML/Markdown/JSON | Unique matched | Reference occurrences |
|---|---:|---:|---:|---:|
| `passed/` | 4 | 3 | 7/7 | 42 |
| `incomplete/` | 3 | 3 | 6/6 | 35 |

No missing artifact, conflicting digest or mismatch. All 77 occurrences resolve to the 13 matched files. HTML artifact digest labels agree with the checked summary references. Generated summary files omit their own digest; the final report envelopes and report log steps supply it. Generated report checksums were checked, not assumed from the pre-report “4 of 4” / “3 of 3” integrity messages.

Each top-level `review.md` is byte-identical to its checksummed generated Markdown. All 8 passed and 3 incomplete pre-report attempts match their corresponding log fields; report steps follow them in the logs. Final command envelopes match `report.json` after excluding its added `code` field. No digests are supplied for provenance, command/recipe logs, pending result or the step-log file itself. Internal checksums establish consistency, not independent origin authentication. Source-file hash-map entries are source identity metadata, not delivered artifact references.

## Actual offline browser review

Read both provenance files before opening either selected HTML. Used a new isolated `agent-browser` session `proof-t96-41858307522`, viewport 1440×1000. Set networking offline **before navigation**; `navigator.onLine` was false on both pages.

Both local `file://` pages loaded. Inspected the rendered page, accessibility tree and full-page screenshot. Opened each failed-attempt disclosure and read its retained assertion, command, source and error data. The passed page shows the correct restored citation; the incomplete page shows no restored proof. Cleanup and limits appear on both. Request history contained only the two local document loads, both 200; no page errors were returned. There were no hyperlinks to test.

Screenshots retained here: `passed-browser.png` (1440×4375), `incomplete-browser.png` (1440×3827). Closed the unique session; it was absent from the subsequent active-session list. No other session was closed.

## Findings and remaining limits

- No blocking integrity or trace defect found for this fixture review.
- Presentation ambiguity: incomplete HTML says “Failed attempt: none — not recorded” above the retained failed `recordedAttempts` reference. This means no validated control result, not no failed execution. Proposed fix: label that field “Validated failed attempt”.
- HTML has no separate visible findings section; finding codes are in its collapsed machine-readable summary and in JSON/Markdown. Proposed fix: render the findings beside incomplete status.
- Environment text says external cleanup true while detailed cleanup says not required. The lifecycle profile resolves this; proposed fix: use “not required” consistently.
- Provenance is retained CI context, not independently checked Actions or PR state. No proof here that the final `CI required` gate, upload policy, all workflow gates or current candidate passed.
- The marker change is not a logged file-operation step. Its presence/absence is observed through the unchanged retained command and operator statements, not a separate filesystem read.
- This review establishes offline report loading for these two files only. It makes no human-usability, general speed, semantic coverage, application-browser, database, cross-platform or arbitrary-change claim.
