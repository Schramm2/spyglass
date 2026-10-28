# Browser claims

Spyglass drives `agent-browser` with its own Chrome or Chromium session for
each seat of the run. Read `spyglass --run <run-id> ui --help` before you
drive it. Use only the run's browser; if it cannot perform a required action,
record an **adapter gap**.

## Prove a UI claim in one call

`ui verify` runs the actions, the expectations and the proof screenshots as
one step:

```sh
spyglass --run <run-id> ui verify --open /dashboard \
  --do "find role button click --name Save" --expect text=Saved \
  --proof saved --viewport 1280x800 --viewport 390x844 --claim <id>
```

The first failed sub-step keeps the sub-steps before it, saves a failure
screenshot and a delta snapshot, and marks the rest `not run`. A step with a
failed or skipped sub-step cannot back a claim. `ui proof <label> --viewport
WxH --expect ...` does the same for the current page.

## Wait on state

- Wait with `ui expect` (`--url`, `--text`, `--visible`, and more, up to
  `--timeout-ms`). It polls in one call and keeps `expect.json` with the last
  observation when a condition never holds.
- Add `--settle` to one `click`, `fill`, `press`, `select` or `find ... click`
  to wait for the navigation or DOM change it starts.
- Read `data.observation` from `snapshot`, `proof` and `verify`: URL, title,
  focus, console errors, failed requests and changed lines. The full snapshot
  stays in `snapshot.json`.

## Selector failures

When a selector matches no element, read `data.nearest`, the interactive roles
and names on the page. A changed name there is a stale selector: fix the
command. A missing element is a product defect: record it against the claim.

## Focus

For a claim about focus, add `--expect-focus-moved <label>` to `ui verify`; it
records focus before and after the actions in `focused.json`. Alone, run
`ui focused` before the action with focus on another element, then
`ui focused --expect <label>` after it, so the step shows that the app moved
focus. `ui focused` never reads a field's value.

## Inspect the screenshot

A screenshot, DOM snapshot or HTTP response alone does not prove a visual
claim. Open each proof screenshot with the harness's image viewer at its
viewport, then record what you saw:

```sh
spyglass --run <run-id> result set --claim <id> \
  --inspect 390x844:<artifact> --expected "<text>" --observed "<text>"
```

A step linked with `--claim` already adds an empty inspection for each
captured viewport; fill each one. If no operator can view the image, mark the
claim `blocked`.

## Expired browsers

An idle run browser shuts down after the profile's `browser.idleTimeoutMs`
(default 1 hour), and the next `ui` command reports `BROWSER_EXPIRED`. Add
`--relogin` to that command to sign the seat in again; the step keeps the
expiry.
