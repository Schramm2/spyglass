# Final artifact-only recheck

## Decision and scope

**All three HTML presentation findings remain fixed, and the residual Markdown validated-label ambiguity is fixed.** No new blocking integrity or trace defect found. The proof is sufficient to identify tested source, intended failure, restored pass where present, cleanup and limits without source or chat.

`passed/` supports the declared public marker-fixture claim/control/gate. `incomplete/` supports intended-failure retention, not passed verification. **No overall CI status is inferred.** The requester reports queued GitHub jobs despite available artifacts; artifact availability and a complete fixture report do not establish workflow completion or the final `CI required` gate.

Reviewed only supplied proof folders, `download-audit.json`, `review-guide.md` and glossary. No source checkout or original chat read; no new verification run, agents or evidence changes. Only this review and screenshots were added outside the evidence folders.

## Delivery and source identities

Both `provenance.json` files record repository `Schramm2/spyglass`, execution `github-actions`, event `pull_request`, workflow **41863511029**, attempt **1**, Node **v24.22.1**.

- Tested checkout and workflow SHA: `2e7a3df7a2a227ccc08f2a84ca962f152f439364`.
- PR candidate head: `9330f4eeb618c64616157e1b1aa45e05be6005b8` — **different from tested checkout**. The guide describes the proposed-merge checkout convention; these artifacts cannot independently establish commit parents or current PR state.
- Baseline/current fingerprint: `f149436d3d53e0872ccb4f674d9c0fd44ec337e90a9ecdf0268a3f8d1ba85d0b`; changed list empty. All steps within each run retain identical source identity, with 787 file hashes. Fast checks report zero files rehashed.

Compared with previously reviewed delivery 41861617920: checkout changed from `f045ade58d415b0eef10a78109c93ba603dea868`, candidate head from `1c0cbfc4d98d76c3ee97f2bd5da5051a443ba3a9`, fingerprint from `fa42b4258cfa5baea220b03016e104371a9f8145ef937b2c02f40f59f57af59b`, file count from 768, Node from v24.22.2. No source-change content is inferred.

Download audit identifies:

| Scenario | Artifact ID | Name | Files |
|---|---:|---|---:|
| passed | 13341970315 | `review-proof-passed-41863511029-1` | 14 |
| incomplete | 13340283405 | `review-proof-incomplete-41863511029-1` | 13 |

Folder counts agree. Audit records `metadataDigestMatched: true` and `safePaths: true`; supplied archive SHA-256 values are `4e95377f945ced5d99307127f4cc2d4bc10bfe637e758f13024145a0db804f36` and `54d9ad34faad7f2f7acc2a46b3ca87875ceeb80d91439ba76f980ef6d8b96f91`. Main checked ZIP digests against GitHub; this artifact-only review did not repeat that remote check.

## Selected reports and proof trace

Selected by provenance, not filename search. Each folder's `recipe.log` equals provenance. Each top-level `review.md` is byte-identical to its checksummed generated Markdown.

### Passed — `ci-passed-41863511029-1`

Selected files under `passed/evidence/`: `cd717a1b-23f-1-index.html`, `cd717a1b-23f-2-review.md`, `cd717a1b-23f-3-summary.json`.

| Operation | Current step | Previous delivery step |
|---|---|---|
| up/profile/plan | `e905621e-22a` | `c04689e8-bdb` |
| intended failed verify | `61dd8a06-151` | `c82927aa-cc5` |
| restored verify | `20a9547a-798` | `863f1208-c63` |
| down | `70d3ea83-79d` | `dde37a4d-0c4` |
| report | `cd717a1b-23f` | `df950ec1-8ad` |

Retained profile checks absence of `.spyglass/ci-fault`. Failed output `passed/evidence/61dd8a06-151-1-verify-output.txt` records assertion `fixture-ready: false`, overall false, detail `Intended fixture failure`. Log and command envelope retain **CHECK_FAILED**: `Check verify failed: one or more assertions failed; the structured result reports failure.` Child exit **0**, Spyglass command exit **1** — not a successful check.

Later restored output `passed/evidence/20a9547a-798-1-verify-output.txt` records the same command/assertion, assertion and overall true, detail `Fixture restored`, command exit 0. Required behavior claim `fixture-ready`, control `detect-fault` and gate `verify` cite `20a9547a-798`; control failure cites `61dd8a06-151`. Links, operator observations, result, summary and log agree.

Observations set at `ed83fa0d-5bd` (claim) and `52268133-8ba` (control); result recorded valid at `2e5d0dbf-a14`; doctor passed at `78175622-cb2`. Down succeeds: stopped, cleanup true. Report succeeds: complete true, passed, no findings.

### Incomplete — `ci-incomplete-41863511029-1`

Selected files under `incomplete/evidence/`: `83835514-29d-1-index.html`, `83835514-29d-2-review.md`, `83835514-29d-3-summary.json`.

| Operation | Current step | Previous delivery step |
|---|---|---|
| up/profile/plan | `b0d32255-2f2` | `24d65ae6-c3d` |
| intended failed verify | `95c5f97f-0fe` | `0c129f11-e0b` |
| down | `d7b1e70a-538` | `e12ed894-d14` |
| report | `83835514-29d` | `6241d93c-270` |

`incomplete/evidence/95c5f97f-0fe-1-verify-output.txt` retains the same false assertion/detail. Step data retains the same exact CHECK_FAILED error and child-0/Spyglass-1 distinction. Control link: `detect-fault:failed`.

Provenance explicitly records `interruption: after-intended-failure`, `problem: null`. No restored attempt or result submission. Pending `evidence/result.json` retains failed step with blank restored step/observations. Summary claim, control and gate are `not run`, without successful citations. `recordedAttempts` retains the failed execution as unvalidated proof.

Down succeeds: stopped, cleanup true. Report exits 1 with **REPORT_INCOMPLETE**, complete false; findings **RESULT_MISSING**, **CONTROL_INCOMPLETE**. This is retained intended failure, not passed verification or a transport error.

Both profiles use lifecycle mode `none`. External owner cleanup is not required. Down proves retained state/cleanup response, not an independent process/port survey or marker-deletion check.

## Checksums and consistency

Recursively checked every artifact `{path, sha256}` reference in folder JSON and JSONL: summaries, command/report envelopes and step logs. Recomputed SHA-256, checked every repeated reference for agreement, and compared HTML artifact digest labels with the checked summary references.

| Folder | Check/config artifacts | Generated HTML/Markdown/JSON | Unique matched | Reference occurrences |
|---|---:|---:|---:|---:|
| passed | 4 | 3 | **7/7** | 42 |
| incomplete | 3 | 3 | **6/6** | 35 |

**13/13 unique artifacts, all 77 references match.** No missing artifact, conflicting digest or mismatch. Generated report/Markdown/summary checksums were checked, not assumed from the earlier integrity messages. Summary self-digests are supplied by final report envelopes/log steps; pre-report 4/4 and 3/3 counts exclude generated files.

All 8 passed and 3 incomplete pre-report attempts match corresponding log fields, followed by the report step. Final command envelopes equal `report.json` except its added `code`. No individual checksum is supplied for provenance, command/recipe logs, pending result or the log file itself. Source hash-map entries are source metadata, not delivered artifact references; source files are absent, so their hashes/fingerprint cannot be independently recomputed. Internal checks establish consistency, not author authentication.

## Actual offline browser checks and presentation closure

Read provenance before opening either selected HTML. Used new isolated session **proof-t96-41863511029**, viewport **1440×1000**; networking set offline before navigation. `navigator.onLine` was false on both pages. Read rendered page text, opened each failed-attempt disclosure, read assertion/error data, and inspected both full-page screenshots.

- **Validated labels:** both HTML files say “Validated failed attempt” / “Validated restored pass”, with recorded execution references separate. Passed cites the correct failed/restored steps; incomplete has no validated proof but retains failed `95c5f97f-0fe`.
- **Visible findings:** directly below header, passed says “No findings”; incomplete shows both exact finding codes/messages without a disclosure.
- **External cleanup:** environment check and detailed cleanup both say “not required”, consistent with lifecycle none.
- **Residual Markdown fixed:** both generated Markdown files now say **Validated intended failure** and **Validated restored pass**. Incomplete's “step not recorded” is explicitly a validated-proof field, separate from its retained recorded attempt. Passed Markdown cites `61dd8a06-151` and `20a9547a-798` correctly.

Request history contained only the two local document loads (200). No page errors returned; neither HTML had hyperlinks. Screenshots retained here: `passed-browser.png` (1440×4534), `incomplete-browser.png` (1440×4018). Unique browser session closed; subsequent session list confirmed it absent. No other session was closed.

## Remaining limits

No new defect found in this scope. Findings closure is limited to these two delivered reports and their Markdown, not every report type, renderer case or platform. Artifact presence does not establish overall CI status; queued-job state remains outside this proof.

Recorded source stability does not independently prove clean source, build/tool provenance, current PR head, all repository gates or final CI completion. Marker creation/removal has no separate retained file-operation step; the unchanged command and observations supply its evidence. It is an environment control, not a product-source mutation.

No human-usability, general speed, semantic coverage, database, target-application browser behavior or arbitrary-change claim is made.
