# Repairs from the first hosted review

The [first artifact-only review](../hosted/41858307522/reviewer.md) identified
three presentation ambiguities. `failure-first.json` records the existing E2E
check's expected and actual predicates before production repairs. Personal
machine paths and the local stack trace are not retained. All three predicates
failed together; the command-control check already passed with mixed-case
script input and a case-insensitive assertion.

After the repairs, `suite.txt` records 114 passing real-tool E2E checks, with no
failures or skips. `format.txt` records the repository formatting check;
`actionlint` and `git diff --check` also passed. `runtime-inputs.json` identifies
the source, tests, example, workflow and built outputs used by that local suite.
It describes a working-tree check, not a hosted commit identity.

The repairs add visible findings below source/status, distinguish validated
attempts from unvalidated recorded attempts, and use not-required external
cleanup text consistently. The test assertion change addresses CodeQL's
uppercase-tag warning; it is not a production sanitizer change.

`checksums.json` covers these retained files, excluding itself. Hosted proof on
the repaired candidate must be recorded separately before M3 is complete.
