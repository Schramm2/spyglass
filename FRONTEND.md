# Browser-facing surfaces

Read this before changing the landing page, manual or offline report.
`DESIGN.md` owns their visual intent; `ARCHITECTURE.md` owns the CLI around
them. There is no frontend framework, package build or client-side router.
These surfaces use HTML, CSS and browser JavaScript.

## Entry points and rendering

| Surface        | Entry point                     | Rendering boundary                                                                         |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Marketing      | `landing/index.html`            | Static HTML; `landing/main.js` adds interactions                                           |
| Manual         | `landing/docs/index.html`       | Static HTML with section anchors; `landing/docs/docs.js` adds search and contents tracking |
| Offline report | `renderHtml` in `src/report.ts` | CLI renders a self-contained page from the run, plan, result and checked artifacts         |
| Demo target    | `fixtures/demo-app/server.mjs`  | Fixture HTTP app, not the Spyglass product interface                                       |

The site can be served directly from `landing/`; this repo has no automated
site deployment workflow. Shared site tokens live in `landing/tokens.css`.
`landing/styles.css` owns marketing composition; `landing/docs/docs.css`
owns manual layout. `landing/copy.js` supplies copy controls for both pages.
Site scripts do not import CLI modules. The report cannot depend on the
site, web fonts, a network request or a development server.

## State and data ownership

- The manual's text is a maintained copy of `README.md`, `src/help.ts`,
  `GLOSSARY.md` and `docs/failure-cases.md`. Change the source and matching
  manual section together. There is no generator or drift check for this
  copy; review is the current enforcement.
- Marketing CLI output and `landing/report-states.js` are retained real demo
  output. Replace them only with new output from an actual run. Page state
  controls select those records; they do not run the CLI.
- `landing/main.js` fetches the public screenshot and hashes its bytes with
  Web Crypto. The tamper control changes an in-memory copy. A request counter
  prevents an older digest from overwriting the newest selection.
- Search terms, selected surface and report-state controls live in the DOM.
  They do not persist to a server, browser storage or a user account. Search
  hides unmatched sections and shows a no-match state. Escape clears manual
  search; `/` focuses it outside an input.
- The run record, not the browser DOM, owns report status. `report` checks
  source identity, cited steps and artifact hashes before rendering. Use
  `htmlEscape` for untrusted text; never insert target output as raw markup.

## Interaction and verification

The static manual and marketing content must remain readable without
JavaScript. Keep native links, buttons, labels, disclosures and visible
keyboard focus. The manual contents collapse on narrow screens. Motion
uses progressive enhancement and respects reduced-motion preferences.

Use the baseline commands in `agent_docs/testing.md`. The surface suite
verifies report behavior and browser driving through the public CLI; it does
not cover the marketing site's search, checksum control or responsive layout.
For a site change, serve `landing/` over local HTTP and use a real browser:

1. Check `/` and `/docs/` at desktop and 390x844 widths, including overflow,
   navigation, long commands and the mobile contents disclosure.
2. Use keyboard navigation and search; check matches, no matches and clearing.
3. Check copy feedback, checksum match, deliberate mismatch and restoration.
4. Inspect page errors and failed requests. Repeat with reduced motion and
   JavaScript disabled where the change can affect the fallback.
5. Retain screenshots and open them before recording visual observations.

For a report change, also open a newly generated report without the target
app or a network connection. Check passed and incomplete results, failed
attempts, changed-source findings, missing artifacts, long output and cleanup
state. Retain the report and its source identity. Do not infer a visual pass
from successful report generation alone.

Update this map when entry points, state owners, rendering boundaries or the
frontend stack change. New UI behavior needs a failure case and owning E2E
coverage under the repository's test-file approval rule.
