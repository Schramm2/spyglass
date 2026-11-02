# Browser claims

Spyglass drives `agent-browser` with its own Chrome or Chromium session for
each seat of the run. Read `spyglass ui --help --json` before you drive it;
the text help is cut short. Use only the run's browser; if it cannot perform a
required action, record an **adapter gap**.

Before the first action, select the claim's seat with `--seat <seat>` and
establish its login and page preconditions. `up --warm --seat <seat>` starts
that seat's browser while the app starts, and signs a seat with a login in
when the app is ready.

## Prove a UI claim in one call

`ui verify` runs the actions, the expectations and the proof screenshots as
one step:

```sh
spyglass --run <run-id> ui verify --open /dashboard \
  --do "find role button click --name Save" --expect text=Saved \
  --proof saved --viewport 1280x800 --viewport 390x844 --claim <id>
```

A failed sub-step keeps the sub-steps before it, marks the rest `not run`, and
saves a failure screenshot and a delta snapshot. If the page capture fails
too, the step keeps the capture error instead; recover the browser before you
collect new proof. A step with a failed or skipped sub-step cannot back a
claim. `ui proof <label> --viewport WxH --expect ...` does the same for the
current page.

## Wait on state

- Prove that an operation finished with an explicit expectation: `ui expect`
  (`--url`, `--text`, `--visible`, and more, up to `--timeout-ms`) or the
  `--expect` of `ui verify`. `ui expect` polls in one call and keeps
  `expect.json` with the last observation when a condition never holds.
- `--settle` on one `click`, `fill`, `press`, `select` or `find ... click`
  waits for a short quiet period after the action. It reduces races; it does
  not prove that the operation finished.
- `data.observation` from `snapshot`, `proof` and `verify` gives the URL,
  title, focus and the counts of console errors, failed requests and changed
  lines. Open the artifact paths in the output for the details. Proof
  snapshots are deltas; `ui snapshot --full` gives the current interactive
  snapshot without the delta filter.

## Selector failures

When a selector matches no element, `data.nearest` lists the interactive roles
and names on the page. Diagnose in this order:

1. Check the seat, the page and the claim's preconditions. If one is wrong,
   restore it and run the same expectation again.
2. Compare `data.nearest` and the retained page state with the claim's
   expected name and state. If the product differs from the claim, record a
   product defect against the claim.
3. If the product matches the claim, the selector is wrong: fix it.

The claim's acceptance condition stays the same in each case.

## Focus

For a claim about focus, add `--expect-focus-moved <label>` to `ui verify`; it
records focus before and after the actions in `focused.json`. Alone, run
`ui focused` before the action with focus on another element, then
`ui focused --expect <label>` after it, and cite both steps. `ui focused`
never reads a field's value.

## Inspect the screenshot

A screenshot, DOM snapshot or HTTP response alone does not prove a visual
claim. Open each proof screenshot with the harness's image viewer at its
viewport, then record what you saw:

```sh
spyglass --run <run-id> result set --claim <id> \
  --inspect 390x844:<artifact> --expected "<text>" --observed "<text>"
```

For a claim of kind `visual`, a passing linked step with explicit `--viewport`
values adds an empty inspection for each captured viewport; fill each one.
For other screenshots, add the inspection yourself with the artifact path
from the output. If no operator can view the image, mark the claim `blocked`.

## Expired browsers

An idle run browser shuts down after the profile's `browser.idleTimeoutMs`,
and the next `ui` command reports `BROWSER_EXPIRED`. Expiry can reset the
active seat, so run that command again with `--seat <seat>` and a trailing
`--relogin`; this signs in a seat that has a login, and the step keeps the
expiry. For a seat without a login, follow the error's `next`. Restore the
page state before dependent actions.
