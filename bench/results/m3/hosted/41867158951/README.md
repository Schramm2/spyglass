# Closing M3 acceptance

- PR: https://github.com/Schramm2/spyglass/pull/28
- Actions: https://github.com/Schramm2/spyglass/actions/runs/41867158951, attempt 1.
- Candidate: `07ecaa6ec26ffc6d6e464bd099f5b387bc7afc1b`.
- Tested merge checkout: `df214f3584234feba03d8cf528ab9a4a36ad101c`.
- Source fingerprint: `83e22ea5849b586b7d71ff843b5ba8ae97c2d10e51e2474aee1218d633bb8dc4`.
- Workflow and `CI required`: **success**. The closing follow-up changes only
  documentation and retained evidence, not this verified implementation/test.

`ci-run.json` records the workflow conclusion. `ci-required.json` records the
successful required-gate job and its completed steps. Job-list states sometimes
lagged behind artifacts and final conclusions; queued display rows are not used
as proof of success. The required gate checks every needed workflow job.

## Byte-exact downloads

`artifacts.json` retains GitHub service metadata. All archive SHA-256 digests
matched that metadata through the authenticated CLI:

- `passed.zip`, artifact **13341319631**, complete fixture proof.
- `incomplete.zip`, artifact **13343715105**, intended failure retained without
  a restored pass or submitted result.
- `default-e2e.zip`, artifact **13343991032**, TAP/XML: **89 passed, 0 failed,
  25 expected opt-in skips**.
- `real-surface-e2e.zip`, artifact **13342961352**, TAP/XML and approved visual
  proof: **25 passed, 0 failed, 0 skipped**. This separately covers the existing
  navigation-control test after it awaited public `--settle` completion.

`download-audit.json` covers the two review archives and safe extraction paths.
`suite-download-audit.json` covers the two E2E archives. `artifact-audit.json`
checks the produced report artifacts. `merge-identity.json` is the separate
GitHub API check of tested merge parents. None of the archives were edited.

## Artifact-only review

The unchanged `reviewer.md` records no source checkout or original chat read,
all **13 unique artifact checksums / 77 references matched**, both selected
HTML files opened offline, all earlier HTML/Markdown findings fixed and no new
blocking report defect. `passed-browser.png` and `incomplete-browser.png` are
its opened full-page captures. The coordinator also opened the selected
incomplete report offline at 390×844; `narrow-browser.png` records it, with
390-pixel viewport and document widths.

The reviewer correctly makes no overall CI or navigation-test verdict from
fixture reports. Those conclusions use the separate workflow/gate metadata
and E2E TAP above. Passed fixture Node is **v24.22.1**; incomplete fixture Node
is **v24.22.2**. They are not identical runtime environments. This is not a
runtime-version comparison, source audit, general speed or usability claim.

Extract each review archive, read `provenance.json`, then open its relative
`report` path. No app, source checkout, Spyglass state or network is needed.
The 14-day service expiry does not remove these retained Git copies.

`checksums.json` covers all files here except itself. The
[M3 record](../../../../../docs/review-m3.md) records completion, earlier
failures/feedback and remaining limits. No release or merge is implied.
