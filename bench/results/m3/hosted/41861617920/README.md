# Second hosted M3 acceptance attempt

- PR: https://github.com/Schramm2/spyglass/pull/28
- Actions: https://github.com/Schramm2/spyglass/actions/runs/41861617920, attempt 1.
- Candidate: `1c0cbfc4d98d76c3ee97f2bd5da5051a443ba3a9`.
- Tested merge checkout: `f045ade58d415b0eef10a78109c93ba603dea868`.

The two `review-proof` jobs passed. `passed.zip` and `incomplete.zip` are
byte-exact downloads, with matching GitHub digests in `download-audit.json`.
`artifacts.json` retains the service metadata; `artifact-audit.json` records
matching checksums for all 13 unique artifacts. `merge-identity.json` is the
coordinator's separate GitHub API check of the merge parents.

`reviewer.md` is the unchanged artifact-only recheck. It traced the new source
and step identities, checked 77 checksum reference occurrences and opened both
selected HTML files offline in an isolated browser. The screenshots retain
those opened pages. All three HTML findings were fixed. Its residual compact
Markdown-label ambiguity led to another failure-first label repair. These
intermediate artifacts and findings were not changed to show that repair.

Extract each archive, read its `provenance.json` and open the relative `report`
path. A green negative matrix job means incomplete-report retention passed;
it is not a successful interrupted verification. These command-only fixture
runs prove no general speed, usability, arbitrary-change or platform claim.

`ci-run.json` records the actual workflow/job conclusions. `checksums.json`
covers the retained files in this directory, excluding itself. Read
[the M3 record](../../../../../docs/review-m3.md) for final acceptance and limits.
