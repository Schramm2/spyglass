# Browser-facing surfaces

Read this before changing the offline report. The marketing site and HTML
manual were removed before launch; `README.md` and `docs/quickstart.md` are
the manual until a new site is built.
`DESIGN.md` owns their visual intent; `ARCHITECTURE.md` owns the CLI around
them. There is no frontend framework, package build or client-side router.
These surfaces use HTML, CSS and browser JavaScript.

## Entry points and rendering

| Surface        | Entry point                     | Rendering boundary                                                                 |
| -------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Offline report | `renderHtml` in `src/report.ts` | CLI renders a self-contained page from the run, plan, result and checked artifacts |
| Demo target    | `fixtures/demo-app/server.mjs`  | Fixture HTTP app, not the Spyglass product interface                               |

The report cannot depend on web fonts, a network request or a development
server.

## State and data ownership

- The run record, not the browser DOM, owns report status. `report` checks
  source identity, cited steps and artifact hashes before rendering. Use
  `htmlEscape` for untrusted text; never insert target output as raw markup.

## Interaction and verification

Use the baseline commands in `agent_docs/testing.md`. The surface suite
verifies report behavior and browser driving through the public CLI.

For a report change, also open a newly generated report without the target
app or a network connection. Check passed and incomplete results, failed
attempts, changed-source findings, missing artifacts, long output and cleanup
state. Retain the report and its source identity. Do not infer a visual pass
from successful report generation alone.

Update this map when entry points, state owners, rendering boundaries or the
frontend stack change. New UI behavior needs a failure case and owning E2E
coverage under the repository's test-file approval rule.
