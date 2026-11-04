# First hosted M3 acceptance

- PR: https://github.com/Schramm2/spyglass/pull/28
- Actions: https://github.com/Schramm2/spyglass/actions/runs/41858307522, attempt 1.
- Candidate head: `561cea397b2329c799772d3a7b78313b78e9aa3e`.
- Tested merge checkout: `3fb71f3d920c07ab453698663be4d85f36d205ec`.
- Every required CI job passed. These artifacts prove the fixed public fixture
  journey, not every behavior in the PR or a general verification-speed claim.

`passed.zip` and `incomplete.zip` are byte-exact GitHub artifact downloads.
`artifacts.json` retains their service names, IDs and SHA-256 digests;
`download-audit.json` records matching archive hashes. `artifact-audit.json`
records all 13 unique produced-artifact hashes matched after extraction.
`ci-run.json` records the actual workflow/job outcomes.

`reviewer.md` is the fresh artifact-only review, unchanged. The reviewer did not
read the source checkout or original conversation. It independently checked
77 JSON/JSONL artifact references, opened both selected reports offline and
inspected the retained screenshots. `passed-browser.png` and
`incomplete-browser.png` are those opened captures. Its presentation findings
led to a bounded follow-up; these first-attempt artifacts remain unchanged.

## Inspect after service retention expires

```sh
unzip passed.zip -d passed
unzip incomplete.zip -d incomplete
```

Read each `provenance.json` and open its relative `report` path. The HTML needs
no app, source checkout, Spyglass state or network. The generated Markdown and
JSON summary also stay in `evidence/`. The complete report passes; the
interrupted report stays incomplete, retains the intended failed assertion and
records successful cleanup. An incomplete matrix job being green means its
failure-retention check passed, not that the interrupted verification passed.

No archive, cited artifact or reviewer finding was edited. This command-only
fixture uses public data and no credentials or browser state. Archive scans
found no verified, unknown or unverified secrets. Checksums establish byte
consistency; the coordinator separately matched archive digests against GitHub
through the authenticated CLI. They are not a source audit or a signature.

`checksums.json` covers the retained files in this directory, excluding itself.
The main [M3 record](../../../../../docs/review-m3.md) separates this first
acceptance, its feedback and repeated proof on the repaired candidate.
