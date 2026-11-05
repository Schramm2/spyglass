# Final report artifact acceptance; separate CI failure retained

- PR: https://github.com/Schramm2/spyglass/pull/28
- Actions: https://github.com/Schramm2/spyglass/actions/runs/41863511029, attempt 1.
- Candidate: `9330f4eeb618c64616157e1b1aa45e05be6005b8`.
- Tested merge checkout: `2e7a3df7a2a227ccc08f2a84ca962f152f439364`.
- Source fingerprint: `f149436d3d53e0872ccb4f674d9c0fd44ec337e90a9ecdf0268a3f8d1ba85d0b`.

`passed.zip` and `incomplete.zip` are byte-exact review-proof downloads. GitHub
metadata is in `artifacts.json`; archive and internal artifact digest audits
are in `download-audit.json` and `artifact-audit.json`. Merge parents are a
separate coordinator API check in `merge-identity.json`.

The unchanged `reviewer.md` records the final artifact-only recheck: no source
or original chat, all 13 unique artifact digests and 77 references matched,
both selected HTML files opened offline, all HTML and Markdown presentation
findings fixed, no new report defect found. Its screenshots are retained here.
The complete fixture passed; the interrupted fixture retained its intended
failure and successful cleanup without inventing passed proof.

This does **not** establish overall CI success. `default-e2e.zip` contains TAP
with 89 passes, no failures and 25 opt-in skips. `real-surface-e2e.zip` contains
TAP with 24 passes and one failure in the existing cross-port navigation test.
Their archive digests matched service metadata, as recorded in
`suite-download-audit.json`. The test read the click result before navigation
completed; it now uses the existing public `--settle` path and keeps the same
error and zero-request assertions. No browser policy or adapter was changed.
The original failure remains in the byte-exact archive.

GitHub initially showed queued jobs despite uploaded archives, then reported
the run failed. `ci-run.json` records the fetched service conclusion, which is
not overridden by a successful fixture report. M3 remains open until the
current candidate passes all required checks.

To inspect: extract an archive, read its `provenance.json`, and open its
relative `report` path. No source checkout, Spyglass state, app or network is
needed. `checksums.json` covers all files here except itself. See
[the M3 record](../../../../../docs/review-m3.md) for closure and remaining
limits. Nothing here claims semantic coverage, general speed or usability.
