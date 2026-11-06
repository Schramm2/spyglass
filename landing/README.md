# Landing page

The public landing page for Spyglass: one static HTML page with a stylesheet
and a small script. It has no build step, package or framework, and it is not
part of the npm package.

| File          | Contents                                                              |
| ------------- | --------------------------------------------------------------------- |
| `index.html`  | All copy and markup. The page reads correctly without JavaScript.     |
| `styles.css`  | Tokens, the tile board layout, the phone layout and motion.           |
| `main.js`     | Copy buttons, the live GitHub star count and the "Break a run" panel. |
| `favicon.svg` | The tab icon.                                                         |

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
- Motion uses transform and opacity only. `prefers-reduced-motion: reduce`
  removes it without hiding content. Scroll-linked reveals run only in
  browsers that support CSS scroll-driven animations.

`DESIGN.md` records the page's visual intent and why it differs from the
README brand.
