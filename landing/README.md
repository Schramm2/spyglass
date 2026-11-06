# Landing page

The public landing page for Spyglass: one static HTML page with a stylesheet
and a small script. It has no build step, package or framework, and it is not
part of the npm package.

| File          | Contents                                                              |
| ------------- | --------------------------------------------------------------------- |
| `index.html`  | All copy and markup. The page reads correctly without JavaScript.     |
| `styles.css`  | Tokens, the tile board layout, the phone layout and motion.           |
| `main.js`     | Copy buttons, the live GitHub star count and the "Break a run" panel. |
| `favicon.png` | The generated tab icon, saved at 64 × 64 pixels.                      |

## Preview

Serve the folder with any static file server, for example:

```sh
npx --yes serve landing
```

Opening `index.html` from the file system also works.

## Deploy

Publish the folder as it is to any static host, such as GitHub Pages,
Cloudflare Pages or Netlify. Set the publish directory to `landing` and leave
the build command empty.

## Content rules

- The "Break a run" panel shows the CLI's own error messages from `src/`.
  When a message changes there, update `FAULTS` in `main.js` in the same pull
  request. Only the `RUN_BUSY` lock path is shortened.
- The report, folder and run cards use output from a real quickstart run
  (`landing-demo`). Replace them with output from a new run rather than
  editing them by hand.
- The star count comes from the GitHub API at page load and stays hidden when
  the request fails or the count is zero.
- Documentation links name the `dev` branch, which is the default branch and
  holds the current guides. Do not link to `blob/main`; files that exist only
  on `dev` return 404 there.
- Motion uses transform and opacity only. `prefers-reduced-motion: reduce`
  removes it without hiding content. Scroll-linked reveals run only in
  browsers that support CSS scroll-driven animations.

## Verify changes

Read [the UI review](review.md) for the task, findings, decisions and limits.
The page keeps its tile-board design. The quickstart stays beside the
product description, report text is not covered by other content, and the
signature does not move continuously.

Run the opt-in Chromium checks from the repository root:

```sh
SPYGLASS_TEST_LANDING=1 \
  SPYGLASS_LANDING_ARTIFACTS=.spyglass/landing-review/final \
  node --test tests/e2e/landing.test.mjs
```

These checks need Node 24 and the installed `agent-browser` with Chromium.
They serve the real page on an isolated loopback port and close their own
browser and server. They retain viewport screenshots, full-page screenshots
and layout observations at the selected artifact path. They cover copy
completion and refusal, simulation faults and recovery, keyboard switches,
JavaScript disabled, external requests blocked and a doubled-text check.
They do not run the CLI surface suite or establish human usability.

Keep Copy hidden until its handler is ready. A refused clipboard write must
leave the command selected and explain manual copy. Keep simulation controls
disabled until setup completes; its local-only notice must remain readable
without JavaScript. Announce a concise result, not the whole transcript.

`DESIGN.md` records the page's visual intent and why it differs from the
README brand.
