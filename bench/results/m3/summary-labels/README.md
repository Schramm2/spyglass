# Compact Markdown label repair

The [second artifact-only review](../hosted/41861617920/reviewer.md) confirmed
the three HTML repairs, but found that the compact Markdown still had the old
failed/restored field labels. `failure-first.json` records the existing owning
E2E check failing on the missing validated label before production changes.
The local stack trace and personal machine paths are not retained.

The two Markdown labels now explicitly refer to validated submitted control
proof, just as HTML does. A retained unvalidated attempt stays separate; this
repair changes no result rule, control state or source validation.

`suite.txt` records 114 passing real-tool E2E checks, with no failures or skips.
`format.txt` records formatting; `git diff --check` also passed. Source, tests,
recipe, workflow and built-output hashes are in `runtime-inputs.json`. This is
working-tree proof, not a hosted source identity. Repeated hosted proof on the
repaired candidate is required separately.

`checksums.json` covers the files here, excluding itself. Historical checks and
reviewer findings in the earlier records remain unchanged.
