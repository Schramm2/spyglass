# Command reference

This page describes what each kind of Spyglass command records. Use
[usage](usage.md) for the order of a run and [configuration](configuration.md)
for the profile. Run `spyglass --help` for all commands, and
`spyglass COMMAND --help` for the arguments of one command.

## Surfaces

| Surface                     | Commands                                                                          | Evidence                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Existing tests and journeys | `check NAME`                                                                      | Exit status, assertions, declared artifacts                                         |
| Other commands              | `exec -- COMMAND ARGS`                                                            | Bounded stdout and stderr, real exit status                                         |
| Web browser                 | `ui open /`, `ui snapshot`, `ui expect`, `ui proof LABEL`, `ui focused`           | Isolated session, screenshot, DOM, errors and requests                              |
| HTTP                        | `api GET /path --expect 200 --expect-json status=ok --wait-until status=complete` | Masked request and response, assertions and poll record; redirects are not followed |
| PostgreSQL                  | `db 'SELECT ...' --expect-rows 1 --expect-col name=alpha`                         | One statement in a read-only transaction, with rows, assertions and role limits     |
| Docker Compose              | `ps --wait`, `mark LABEL`, `logs SERVICE --since-step ID --grep PATTERN`          | Project-scoped status and timestamped logs                                          |
| Other evidence              | `evidence add --step ID --file PATH`                                              | Checked copy from a declared import root                                            |

## Browser expectations

`ui expect` waits for the page inside one call. It polls every 100 ms until
each condition holds or `--timeout-ms` ends (default 5000, maximum 120000), and
it writes `expect.json`. It exits 1 and keeps the last observation when a
condition never holds. It never reads an input value: `--attr value` is refused.

| Flag                              | The condition holds when                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--url PATTERN`                   | The URL contains `PATTERN`. With `*`, the pattern matches the whole URL, or the path and query when it has no scheme. |
| `--text TEXT`                     | The page text contains `TEXT`.                                                                                        |
| `--title TEXT`                    | The page title is `TEXT`.                                                                                             |
| `--selector SEL`                  | At least one element matches `SEL`.                                                                                   |
| `--visible SEL` / `--hidden SEL`  | An element matches and is visible, or none matches or it is not visible.                                              |
| `--enabled SEL` / `--checked SEL` | The element is enabled, or checked.                                                                                   |
| `--count SEL=N`                   | Exactly `N` elements match `SEL`.                                                                                     |
| `--focused LABEL`                 | The focused element has the label `LABEL`.                                                                            |
| `--attr SEL:NAME=VALUE`           | The attribute `NAME` of the element is `VALUE`.                                                                       |
| `--no-errors`                     | The page has no page error and no console error.                                                                      |

```sh
spyglass ui expect --url /dashboard --text "Ask a question" --visible "#question" --run ID
```

## Check data and wait for jobs in one call

| Command                                    | Option                                                                   | Meaning                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`                                      | `--expect-json PATH=VALUE` or `PATH!=VALUE`                              | Check a field of the JSON body. A dotted `PATH` reaches objects, array indexes and `length`, for example `items.length=3`. A path that is not in the body fails both forms.                                                                    |
| `api`                                      | `--expect-body-contains TEXT`                                            | The raw body contains `TEXT`.                                                                                                                                                                                                                  |
| `api POST` (also `PUT`, `PATCH`, `DELETE`) | `--then GET PATH [--then-expect STATUS] [--then-expect-json PATH=VALUE]` | Make one immediate read after a successful write. `{body.id}` fills a URL-encoded scalar, non-secret response field. The GET reuses the seat and expects HTTP 200 by default. Both requests stay in one step; this is not an independent read. |
| `api GET`                                  | `--wait-until PATH=VALUE`                                                | Poll until the field has the value. Add `--fail-on PATH=VALUE` to stop at a failed state, `--timeout-ms` (default 15000) and `--interval-ms` (default 250).                                                                                    |
| `db`                                       | `--expect-col COLUMN=VALUE`                                              | The first row has the value. A dotted name reaches into a JSON column. Repeat the flag for more columns.                                                                                                                                       |
| `db`                                       | `--expect-empty`                                                         | The query returns no row (`--expect-rows 0`).                                                                                                                                                                                                  |
| `ps`                                       | `--wait`, `--timeout-ms MS`                                              | Poll every 500 ms until each required service is running and, with a health check, healthy.                                                                                                                                                    |
| `logs`                                     | `--since-step ID`, `--since-last`                                        | Start at a step's start time, or the previous step, with no `mark`.                                                                                                                                                                            |
| `logs`                                     | `--grep PATTERN`, `--expect-text TEXT`, `--forbid-text TEXT`             | Keep matching lines, then require or refuse text.                                                                                                                                                                                              |

For a pending-state control, use `api POST /questions --data @question.json
--expect 202 --then GET '/questions/{body.id}' --then-expect-json status=complete
--control completion-detects-pending:failed --run ID --seat agent`. The
follow-up assertion keeps the name `json status=complete`; write assertions
have the prefix `write `. A later separate GET with the same assertion can
supply the restored pass and independent read. The combined step keeps the
write's method, status and body, with the read in `data.followUp` and a
separate masked artifact for each request. A failed write skips the GET.
Invalid follow-up options and origins are rejected before the write; a
missing, non-scalar or secret template value stops before the GET and keeps
the write's evidence. The operation supports one follow-up GET, without polling.

Each check is an assertion of the step in `data.claims`. A failed check exits 1
and keeps the response, the bounded query result or the log. A poll keeps its
poll count and elapsed time in `api-response.json`. A poll that times out or
reaches a `--fail-on` state fails the step, so it cannot be an independent read;
a poll that reaches its value can be. `db` reads the privileges of its role once
per run, at `doctor` or on the first query, and reuses them for the same
connection; `doctor` reads them again. Every query still runs in a read-only
transaction.

## Verify one claim in one call

`ui verify` runs the actions, the expectations and the proof of one claim as one
step with ordered sub-steps:

```sh
spyglass ui verify --open /dashboard \
  --do 'find label Question fill "Does it work?"' \
  --do "find role button click --name 'Submit question'" \
  --expect text="Ask a question" --expect visible="#question" \
  --proof dashboard --viewport 1280x800 --viewport 390x844 \
  --claim form-works --claim form-looks-right --run ID
```

| Flag                         | Meaning                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--open PATH`                | Open a page first.                                                                                                                                                                                           |
| `--do COMMAND`               | One browser command. Repeat the flag for more. A `click`, `fill`, `press` or `select` settles before the next sub-step. A screenshot is not an action: use `--proof`.                                        |
| `--expect KIND=VALUE`        | An expectation of `ui expect`: `url`, `text`, `title`, `selector`, `visible`, `hidden`, `enabled`, `checked`, `count=SEL=N`, `focused`, `attr=SEL:NAME=VALUE` or `no-errors`. Spyglass checks them in order. |
| `--expect-focus-moved LABEL` | Record the focus before the actions and after them in `focused.json`. It fails when focus was already on `LABEL`, or is not on it afterward.                                                                 |
| `--proof LABEL`              | Save `proof-LABEL.png`, its snapshot and its details.                                                                                                                                                        |
| `--viewport WxH`             | With `--proof`, repeat per viewport: resize, settle, check every `--expect` again and save `proof-LABEL-WxH.png`.                                                                                            |
| `--timeout-ms MS`            | The limit for each expectation (default 5000).                                                                                                                                                               |

When sub-step K fails, the sub-steps before it stay `passed`, K keeps its
failure with a failure screenshot and a delta snapshot, and the later ones are
`not run`. The step exits 1 and stays in the log. Each expectation is an
assertion in `data.claims`. A claim cannot cite a batch step that has a failed
or skipped sub-step: `result` reports `EXPECTATION_FAILED`,
`EXPECTATION_NOT_RUN`, `ACTION_FAILED` or `ACTION_NOT_RUN` and names it. With
`--claim ID` on a visual claim, Spyglass adds an inspection per viewport with
the viewport and the screenshot. You write the `expected` and `observed` text
after you look at the image.

`ui proof LABEL --viewport 1280x800 --viewport 390x844 --expect visible="#form"`
does the same for the current page: it resizes, settles, checks the
expectations and saves one screenshot per viewport.

Proof capture saves the snapshot and page diagnostics before clearing browser
buffers or taking the screenshot. Capture has a 20-second total budget per
viewport: snapshot and diagnostics each have at most 5 seconds, buffer clearing
and frame settling each have at most 1 second, and the screenshot has at most
10 seconds, limited by the remaining total budget. Frame settling waits for two
frames or 250 ms; the image still requires a successful screenshot.

A capture failure names its stage in `data.capture.stage` and retains stage
outcomes in `data.capture.stages` and a `*-capture-error.json` artifact. Earlier
snapshot and details artifacts remain valid. A failed proof leaves its claim
incomplete; DOM evidence cannot replace a screenshot inspection. `ui verify`
uses the retained diagnostics instead of attempting another screenshot after a
capture failure. For an action or expectation failure, its diagnostic capture
has a separate 5-second total budget and a 2-second screenshot limit. If this
recovery capture fails, the original action or expectation error stays in
`error`; `data.capture.recovery` is `true`, and `data.captureError` records the
capture error. These capture limits are separate from the expectation flag `--timeout-ms`.

Add `--settle` to one `click`, `dblclick`, `press`, `fill`, `select`, `type` or
`find ... click` command. Spyglass then waits until the page is loaded and no
DOM change has happened for 150 ms, for at most 3 seconds, and records it in
`data.settled`. It does not wait for network idle, which an event stream never
reaches.

When a selector action matches no element, the error has `data.nearest`: up to
10 interactive roles and names from the page, nearest to your request first.
The page snapshot stays in the evidence folder. Use it to tell a stale
selector from a product defect.

When `ui snapshot`, `ui proof` or `ui verify` ends, `data.observation` holds a
short block: the URL and title, the focused element, the counts of console
errors, failed requests and interactive elements, the changed lines and the
artifacts. It is at most 40 lines. A long snapshot stays whole in the artifact
`snapshot.json`; the output keeps the first lines and the path.

Every failed command prints a `next` action that names the run, the seat and
the flags, so you can copy it and run it as written.
