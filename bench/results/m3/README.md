# M3 local evidence

This folder retains selected public evidence for the uncommitted M3 candidate.
It is not a hosted CI run, real-PR acceptance, release or general performance
claim. Read [the M3 record](../../../docs/review-m3.md) for scope and open checks.

## Files

- `suite.txt`: final build and 114 real-tool E2E outcomes, with no skips.
- `format.txt`: repository formatting check.
- `recipe-gates.jsonl`: local execution of the workflow's assertion block.
  Only the Actions execution-context expectation was changed to local. The
  complete and interrupted deliveries pass; unrelated-failure and truncated
  JSON controls are refused while keeping cleanup and report attempts.
- `gfm-before.html`: GitHub's GFM renderer still linked the email control after
  numeric entity escaping. This is the retained failed renderer attempt.
- `gfm-input.md` and `gfm-after.html`: the generated public control summary and
  its actual GitHub GFM rendering after the inline-boundary repair. The input
  contains deliberate malicious-looking text. It must remain text: the output
  has no link, image, script or injected heading.
- `gfm-check.json`: the asserted renderer outcome for that supplied payload.
- `local-runs.json`: selected complete/interrupted local outcomes and artifact
  checksums, without private paths. The passed recipe was also repeated on
  unchanged source to check fresh gate proof.
- `report-incomplete-narrow.png` and `report-control-narrow.png`: opened,
  offline 390x844 views after cleanup and the wrapping repair.
- `manual-wide.png` and `manual-narrow.png`: opened updated command guidance at
  1280x800 and 390x844.
- `runtime-inputs.json`: SHA-256 values for runtime source, package/build
  inputs and the complete local `dist` file set. It identifies the checked
  local build, not an immutable published release.

`checksums.json` covers the public files in this folder and excludes itself.
No checksummed run artifact was rewritten. Raw local run diagnostics and
operator transcripts are not distributed. These selected logs have no private
source paths or credentials. The GFM input/output use only the public fixture
and reserved example domains; the rendering API creates no PR or comment.

## Repeat

From a clean source checkout with Node 24, Git, `agent-browser` 0.38.2,
Chromium and Docker Compose:

```sh
npm ci
SPYGLASS_TEST_SURFACES=1 npm test
npm run format:check
actionlint .github/workflows/ci.yml
node examples/ci-run.mjs passed
node examples/ci-run.mjs incomplete   # must exit 1 with retained report
```

The recipe checks the intended failed assertion before marking the interruption.
Its workflow assertion block rejects unexpected errors and requires source unchanged since `up`,
valid artifacts and successful cleanup. A nonzero interrupted command is not
itself proof that the expected-failure check worked.

To repeat the supplied renderer check without publishing anything:

```sh
node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.stringify({text:fs.readFileSync("bench/results/m3/gfm-input.md","utf8"),mode:"gfm"}))' \
  | gh api markdown --input - > /tmp/spyglass-m3-gfm.html
```

Inspect the rendered file, and check that it has no `a`, `img` or `script`
element and no extra heading from the payload. This API rendering check is
separate from the still-pending real Actions upload/download and artifact review.
