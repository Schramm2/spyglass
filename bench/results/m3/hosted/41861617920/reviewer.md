# Artifact-only candidate review

## Decision

**All three earlier HTML presentation findings are fixed in the two selected reports.** No blocking artifact-integrity or fixture-proof defect found. The evidence is sufficient to identify the tested checkout, failure, restored pass where present, cleanup and limits without source or chat.

The passed delivery proves its declared marker-fixture claim/control/gate. The incomplete delivery proves intended-failure retention, not a passed verification. A remaining Markdown label ambiguity is recorded below.

Reviewed supplied `passed/`, `incomplete/`, `download-audit.json`, `review-guide.md` and glossary only. No source checkout or original chat was read; no verification run, agent or evidence change was made. This review and its two screenshots are new files outside the evidence folders.

## Source and delivery identities

Both provenance files record `Schramm2/spyglass`, `github-actions`, `pull_request`, workflow **41861617920**, attempt **1**, Node `v24.22.2`.

- Tested checkout and workflow SHA: `f045ade58d415b0eef10a78109c93ba603dea868`.
- PR candidate head: `1c0cbfc4d98d76c3ee97f2bd5da5051a443ba3a9` — different from the tested checkout. The guide identifies the proposed-merge checkout convention; these files cannot independently establish its parents or current PR state.
- Baseline/current fingerprint: `fa42b4258cfa5baea220b03016e104371a9f8145ef937b2c02f40f59f57af59b`; changed list empty. All steps retain the same source identity within each run, with 768 file hashes. Fast checks report zero files rehashed.

Compared with the earlier reviewed delivery 41858307522: checkout changed from `3fb71f3d920c07ab453698663be4d85f36d205ec`, candidate head from `561cea397b2329c799772d3a7b78313b78e9aa3e`, fingerprint from `7348cdb49bd41baf4f2baf2b9c312facc8b04085b8c6f4aafd7b86f77753aed4`, and recorded file count from 751. The new evidence is not proof for the old identity or vice versa. No source-change content is inferred.

Download audit names:

| Scenario | Artifact ID | Name | Files |
|---|---:|---|---:|
| passed | 13339757312 | `review-proof-passed-41861617920-1` | 14 |
| incomplete | 13339937022 | `review-proof-incomplete-41861617920-1` | 13 |

File counts agree. Audit records `metadataDigestMatched: true` and `safePaths: true` for each. Supplied archive SHA-256 values are `cdd1b4f9123be4e9613e895a17f7d6ccc2a5f8f42ed9a8d1d679479ccbace01e` and `c86b165ce42079ef9b568c5811802fddf7b6cd88a707091f6fb78b7a146d1988`. GitHub digest comparison was supplied by the requester/audit, not repeated in this offline review.

## Selected reports and attempt trace

Paths come from each `provenance.json`, not a filename search. In each folder, `recipe.log` equals provenance and top-level `review.md` equals the checksummed generated Markdown.

### Passed — `ci-passed-41861617920-1`

Selected HTML `passed/evidence/df950ec1-8ad-1-index.html`; Markdown `df950ec1-8ad-2-review.md`; summary `df950ec1-8ad-3-summary.json`, all under `passed/evidence/`.

| Operation | New step | Earlier corresponding step |
|---|---|---|
| up; retained profile/plan | `c04689e8-bdb` | `8dc18f09-643` |
| intended failed verify | `c82927aa-cc5` | `a12f1e6c-e18` |
| restored verify | `863f1208-c63` | `e40472b9-9a8` |
| down | `dde37a4d-0c4` | `46ddfcce-12d` |
| report | `df950ec1-8ad` | `c648d4b8-abd` |

The profile checks absence of `.spyglass/ci-fault`; retained command and assertion are unchanged between failed and restored attempts. Failure output `passed/evidence/c82927aa-cc5-1-verify-output.txt` records assertion `fixture-ready: false`, overall false, detail `Intended fixture failure`. Step data and `commands.json` retain `CHECK_FAILED`: `Check verify failed: one or more assertions failed; the structured result reports failure.` Child exit is **0**, Spyglass command exit **1**.

Restored output `passed/evidence/863f1208-c63-1-verify-output.txt` records assertion/overall true, detail `Fixture restored`, command exit 0. Required behavior claim `fixture-ready`, control `detect-fault` and gate `verify` cite this successful step. Control cites `c82927aa-cc5` as its failure. Observations were set at `663ece12-1c2` and `e53724b5-a64`; result recorded valid at `53968b68-a5c`; doctor passed at `dcec1288-ea5`. Pending result, summary and log citations agree.

Down succeeds: stopped, cleanup true. Report succeeds: complete true, passed, findings empty.

### Incomplete — `ci-incomplete-41861617920-1`

Selected HTML `incomplete/evidence/6241d93c-270-1-index.html`; Markdown `6241d93c-270-2-review.md`; summary `6241d93c-270-3-summary.json`, all under `incomplete/evidence/`.

| Operation | New step | Earlier corresponding step |
|---|---|---|
| up; retained profile/plan | `24d65ae6-c3d` | `afc11ef6-fba` |
| intended failed verify | `0c129f11-e0b` | `d1a16267-070` |
| down | `e12ed894-d14` | `84e14d04-3a4` |
| report | `6241d93c-270` | `c69af182-ddc` |

`incomplete/evidence/0c129f11-e0b-1-verify-output.txt` retains the same false assertion/detail. Step data retains the same exact `CHECK_FAILED` error and child-0/Spyglass-1 distinction. Linked control is `detect-fault:failed`.

Provenance records `interruption: after-intended-failure`, `problem: null`. No restored attempt or result submission exists. Pending result retains failed step with blank restored step/observations. Summary claim, control and gate are `not run`, with no successful citations; `recordedAttempts` preserves the failed step as unvalidated proof.

Down succeeds: stopped, cleanup true. Report exits 1 with `REPORT_INCOMPLETE`; complete false. Findings: `RESULT_MISSING`, `CONTROL_INCOMPLETE`. This does not qualify as a passed fixture claim/control/gate.

Both profiles use lifecycle mode `none`, so external owner cleanup is not required. Cleanup is retained state plus successful down, not an independent process/port survey or marker-deletion check.

## Checksum and consistency checks

Recursively collected every artifact `{path, sha256}` reference from folder JSON and JSONL, including summaries, step logs, command envelopes and report envelopes. Recomputed file SHA-256 and checked all repeated references for agreement.

| Folder | Check/config artifacts | Generated HTML/Markdown/JSON | Unique matched | Reference occurrences |
|---|---:|---:|---:|---:|
| passed | 4 | 3 | **7/7** | 42 |
| incomplete | 3 | 3 | **6/6** | 35 |

**All 13 unique artifacts and 77 occurrences match; none missing or conflicting.** This includes both generated Markdown files, both HTML files and both JSON summaries. HTML artifact labels match the checked summary digests. Summary self-digests come from final report envelopes/log steps, not the summary itself. Pre-report integrity counts 4/4 and 3/3 do not include those generated files.

All 8 passed and 3 incomplete pre-report attempts match their corresponding log fields; report steps follow in the logs. Final command envelopes equal `report.json` apart from its added `code`. These internal checks do not authenticate the author. No individual checksum is supplied for provenance, commands/recipe logs, pending result or the log file itself. Source hash-map entries are source metadata, not delivered artifacts; absent source files prevent independent fingerprint recomputation.

## Actual offline browser checks and finding closure

Read provenance first. Opened both selected local HTML files in new isolated session **`proof-t96-41861617920`**, viewport **1440×1000**, after setting networking offline. `navigator.onLine` was false on both. Inspected rendered pages, accessibility trees and full-page screenshots; opened and read each failed-attempt disclosure, including assertion/error data. Request history contained only the two local document loads (200); no page errors were returned and neither page had hyperlinks.

| Earlier finding | Observed new presentation | Result |
|---|---|---|
| “Failed attempt: none” confused validation with execution | Both pages use **Validated failed attempt** / **Validated restored pass**. Incomplete retains failed recorded attempt `0c129f11-e0b` separately. | Fixed in HTML |
| Findings hidden in machine-readable data | Visible **Findings** section directly below header: passed says “No findings”; incomplete shows both exact finding codes/messages without disclosure. | Fixed |
| External cleanup true vs not required | Environment checks and detailed cleanup both say **not required**, consistent with lifecycle none. | Fixed |

Screenshots retained here: `passed-browser.png` (1440×4534) and `incomplete-browser.png` (1440×4018). Unique session closed; a subsequent active-session list confirmed it absent. No other session was closed.

## Remaining limits

- **Residual Markdown ambiguity:** incomplete generated Markdown still says `Intended failure: ... step not recorded — not recorded` above recorded failed step `0c129f11-e0b`. The HTML distinction is fixed, but Markdown does not use the new validated label. Proposed follow-up: label submitted-control fields consistently in Markdown. It does not invalidate the retained failure.
- No new blocking limit found. This two-file browser inspection proves these reports display the three fixes, not every renderer case, platform or report type.
- Recorded source stability is not independent proof of clean source, built-tool provenance or current PR state. No source checkout or remote Actions state was consulted. Final `CI required`, other repository gates and upload-policy behavior are not established here.
- Marker creation/removal is inferred only through the unchanged fixture command and recorded observations, not separate retained file-operation steps. The marker is an environment control, not a product-source mutation.
- No human-usability, general speed, semantic coverage, database, target-application browser behavior or arbitrary-change claim is made.
