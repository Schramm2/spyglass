<h1 align="center">
  <img src="docs/assets/hero.png" alt="Spyglass. Verify code changes with real tools, and keep the evidence." width="100%">
</h1>

<p align="center">
  <a href="https://github.com/Schramm2/spyglass/actions/workflows/ci.yml"><img src="https://github.com/Schramm2/spyglass/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933.svg" alt="Node.js 24+">
</p>

Spyglass is a command-line tool for coding agents and the people who review
their work. It connects browser actions, HTTP calls, database reads and
repository checks to one **run**. Each run records its source identity, every
attempt (failed attempts too) and its artifacts. The evidence stays after
cleanup, so another agent or person can inspect the result later without the
original chat or shell.

<p align="center">
  <img src="docs/assets/how-it-works.png" alt="One run: a code change, verified with real tools (browser, HTTP, database and checks), gives evidence (screenshots, logs, rows and checksums), and the evidence goes into a report." width="100%">
</p>

> [!NOTE]
> Spyglass 1.2.0 uses version 1 profile, plan and result schemas.

## Why Spyglass

An agent can say "the tests pass" or "the page works". That statement is not
proof. Spyglass makes each verification step a recorded fact:

- **Real tools, no mocks.** Spyglass drives a real browser, real HTTP requests,
  a real PostgreSQL database and the repository's own checks.
- **Evidence that stays.** Screenshots, responses, query rows and logs go to a
  Git-ignored evidence folder with checksums. Cleanup does not remove them.
- **Honest results.** Failed attempts stay in the record. A report stays
  incomplete until each claim has a completed step and its evidence.
- **Source identity.** Each run records the commit and working-tree state.
  Evidence from source that changed after the run started cannot pass as
  proof for the original source.
- **Safe by default.** The browser can open only the configured origins.
  Database queries run in a read-only transaction. Reports mask credentials,
  cookies and authorization headers.
- **Built for agents.** Each command gives a versioned JSON result with
  `--json`, uses stable exit codes and never prompts.

Spyglass does not decide whether a claim covers the request, or whether a
screenshot looks correct. The **operator** (the agent or person) selects the
claims and judges the results. Spyglass makes sure that the cited steps
completed, the artifacts exist, the source is current and the cleanup is done.

## Requirements

- [Node.js](https://nodejs.org/) 24 or later
- Git

These tools are necessary only for some surfaces:

| Tool | Necessary for |
| --- | --- |
| [`agent-browser`](https://www.npmjs.com/package/agent-browser) 0.38.2 | `up` for a profile with a `web` origin. Browser checks (`ui`) also need its Chromium. |
| Docker Compose | Container status and logs (`ps`, `logs`) |
| A PostgreSQL database | Database reads (`db`). The driver is included. |

Spyglass does not install tools, fetch secrets or start your app during `init`.

## Installation

Spyglass is not on npm yet. Install it from source:

```sh
git clone --branch v1.2.0 https://github.com/Schramm2/spyglass.git
cd spyglass
npm ci
npm run build
npm link
spyglass --version
```

## Quick start

The [terminal quickstart](docs/quickstart.md) runs a local demo app. It records
a deliberate failure and a passing check, and keeps the report after cleanup.
It takes approximately five minutes and uses no paid services.

In your own repository, the workflow is:

```sh
spyglass init                                   # write spyglass.json; review it
spyglass up --run my-change --plan verification-plan.json --json
spyglass check verify --run my-change --claim CLAIM_ID --json   # run a check; link it to a claim
spyglass result set --run my-change --claim CLAIM_ID --outcome passed --observed "WHAT YOU SAW"
spyglass status --work --run my-change          # what each claim still needs
spyglass result --check --run my-change         # validate; record nothing
spyglass finish --run my-change --json          # result, doctor, down and report
```

`finish` runs `result`, `doctor`, `down` and `report` in order. You can run each
command alone instead. Each stage is its own step in the log. The first failed
stage stops `finish`, writes no report and exits with that stage's status; the
error says how to repair it and to run `finish` again. Add `--cleanup CHECK` to
run the owner's cleanup check (a profile check with `cleanup: true`) before
`down`. A stopped run skips `doctor` and `down`.

Add `.spyglass/` to your `.gitignore`. It holds the evidence folder.

`up --plan` writes a pending result file and prints its path. Run each step
with `--claim ID`: when the step passes, Spyglass adds its step ID and its
artifact paths to that claim in the pending file. You write only what a person
must judge: what you observed and the outcome of each claim, with
`spyglass result set`. Check the file with `spyglass result --check`. It lists
every finding at once in `data.findings`, and each finding has a `repair`. Then
record it with `spyglass result`, which reads the pending file when you give no
`--file`. If a check fails, keep the original expectation. Repair the source
and start a new run.

## Usage

### Surfaces

| Surface | Commands | Evidence |
| --- | --- | --- |
| Existing tests and journeys | `check NAME` | Exit status, assertions, declared artifacts |
| Other commands | `exec -- COMMAND ARGS` | Bounded stdout and stderr, real exit status |
| Web browser | `ui open /`, `ui snapshot`, `ui expect`, `ui proof LABEL`, `ui focused` | Isolated session, screenshot, DOM, errors and requests |
| HTTP | `api GET /path --expect 200 --expect-json status=ok --wait-until status=complete` | Masked request and response, assertions and poll record; redirects are not followed |
| PostgreSQL | `db 'SELECT ...' --expect-rows 1 --expect-col name=alpha` | One statement in a read-only transaction, with rows, assertions and role limits |
| Docker Compose | `ps --wait`, `mark LABEL`, `logs SERVICE --since-step ID --grep PATTERN` | Project-scoped status and timestamped logs |
| Other evidence | `evidence add --step ID --file PATH` | Checked copy from a declared import root |

Run `spyglass --help` for all commands, and `spyglass COMMAND --help` for the
arguments of one command.

### Browser expectations

`ui expect` waits for the page inside one call. It polls every 100 ms until
each condition holds or `--timeout-ms` ends (default 5000, maximum 120000), and
it writes `expect.json`. It exits 1 and keeps the last observation when a
condition never holds. It never reads an input value: `--attr value` is refused.

| Flag | The condition holds when |
| --- | --- |
| `--url PATTERN` | The URL contains `PATTERN`. With `*`, the pattern matches the whole URL, or the path and query when it has no scheme. |
| `--text TEXT` | The page text contains `TEXT`. |
| `--title TEXT` | The page title is `TEXT`. |
| `--selector SEL` | At least one element matches `SEL`. |
| `--visible SEL` / `--hidden SEL` | An element matches and is visible, or none matches or it is not visible. |
| `--enabled SEL` / `--checked SEL` | The element is enabled, or checked. |
| `--count SEL=N` | Exactly `N` elements match `SEL`. |
| `--focused LABEL` | The focused element has the label `LABEL`. |
| `--attr SEL:NAME=VALUE` | The attribute `NAME` of the element is `VALUE`. |
| `--no-errors` | The page has no page error and no console error. |

```sh
spyglass ui expect --url /dashboard --text "Ask a question" --visible "#question" --run ID
```

### Check data and wait for jobs in one call

| Command | Option | Meaning |
| --- | --- | --- |
| `api` | `--expect-json PATH=VALUE` or `PATH!=VALUE` | Check a field of the JSON body. A dotted `PATH` reaches objects, array indexes and `length`, for example `items.length=3`. A path that is not in the body fails both forms. |
| `api` | `--expect-body-contains TEXT` | The raw body contains `TEXT`. |
| `api GET` | `--wait-until PATH=VALUE` | Poll until the field has the value. Add `--fail-on PATH=VALUE` to stop at a failed state, `--timeout-ms` (default 15000) and `--interval-ms` (default 250). |
| `db` | `--expect-col COLUMN=VALUE` | The first row has the value. A dotted name reaches into a JSON column. Repeat the flag for more columns. |
| `db` | `--expect-empty` | The query returns no row (`--expect-rows 0`). |
| `ps` | `--wait`, `--timeout-ms MS` | Poll every 500 ms until each required service is running and, with a health check, healthy. |
| `logs` | `--since-step ID`, `--since-last` | Start at a step's start time, or the previous step, with no `mark`. |
| `logs` | `--grep PATTERN`, `--expect-text TEXT`, `--forbid-text TEXT` | Keep matching lines, then require or refuse text. |

Each check is an assertion of the step in `data.claims`. A failed check exits 1
and keeps the response, the bounded query result or the log. A poll keeps its
poll count and elapsed time in `api-response.json`. A poll that times out or
reaches a `--fail-on` state fails the step, so it cannot be an independent read;
a poll that reaches its value can be. `db` reads the privileges of its role once
per run, at `doctor` or on the first query, and reuses them for the same
connection; `doctor` reads them again. Every query still runs in a read-only
transaction.

### Verify one claim in one call

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

| Flag | Meaning |
| --- | --- |
| `--open PATH` | Open a page first. |
| `--do COMMAND` | One browser command. Repeat the flag for more. A `click`, `fill`, `press` or `select` settles before the next sub-step. A screenshot is not an action: use `--proof`. |
| `--expect KIND=VALUE` | An expectation of `ui expect`: `url`, `text`, `title`, `selector`, `visible`, `hidden`, `enabled`, `checked`, `count=SEL=N`, `focused`, `attr=SEL:NAME=VALUE` or `no-errors`. Spyglass checks them in order. |
| `--expect-focus-moved LABEL` | Record the focus before the actions and after them in `focused.json`. It fails when focus was already on `LABEL`, or is not on it afterward. |
| `--proof LABEL` | Save `proof-LABEL.png`, its snapshot and its details. |
| `--viewport WxH` | With `--proof`, repeat per viewport: resize, settle, check every `--expect` again and save `proof-LABEL-WxH.png`. |
| `--timeout-ms MS` | The limit for each expectation (default 5000). |

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

Add `--settle` to one `click`, `dblclick`, `press`, `fill`, `select`, `type` or
`find ... click` command. Spyglass then waits until the page is loaded and no
DOM change has happened for 150 ms, for at most 3 seconds, and records it in
`data.settled`. It does not wait for network idle, which an event stream never
reaches.

When a selector action matches no element, the error has `data.nearest`: up to
10 interactive roles and names from the page, nearest to your request first.
The page snapshot stays in the evidence folder. Use it to tell a stale
selector from a product defect.

### Shorter runs

| Command | What it saves |
| --- | --- |
| `up --warm [--seat SEAT]` | Starts the exact-origin proxy and the headless browser of a seat while the app starts. With `--seat`, it signs the seat in once the app is ready, if the seat has a login. `data.warm` shows it. If `up` fails, the warm browser and proxy close. |
| `check a,b`, `check --gates [--concurrency N]` | Runs checks at the same time (default 4, up to 8). Each check is its own step and keeps its artifacts; the run lock and the log stay whole. The checks must not change the source. `--gates` runs the profile checks named like the planned gates and links each to its gate. |
| `ui ... --relogin` | When the seat's browser expired and the seat has a login, signs the seat in again, then runs the command. The step keeps the expiry in `data.relogin`. |
| `finish` | Runs `result`, `doctor`, `down` and `report`. |

`check`, `exec`, `api` and `db` read again only the source files whose size,
modification time, change time, inode or mode changed since the last full check,
and every new file. `data.sourceCheck` counts the files that they read again.
`doctor` and `report` hash every file. `doctor` also runs its independent probes
at the same time. `bench/overhead.mjs` measures the time that Spyglass adds to a
browser command; see [browser-benchmark.md](docs/browser-benchmark.md).

### Link steps to claims

A driving command (`ui`, `api`, `db`, `check`, `exec`, `evidence add`) can link
its step to the pending result while it runs:

| Flag | When the step passes |
| --- | --- |
| `--claim ID` | Adds the step ID and the artifacts of the step to claim `ID`. Repeat it for more claims. |
| `--independent-read` | With `--claim`, sets `independentRead` of the claim to this step. Use it on the read that follows a side effect. |
| `--control ID:failed` | Sets `failedStep` of control `ID`. The step fails on purpose, so Spyglass links it when it fails. |
| `--control ID:restored` | Sets `restoredStep` of control `ID` and cites it in the claim of the control. |
| `--gate NAME` | Adds the step to gate `NAME` and sets its outcome to `passed`. A failed step sets `failed`. |

A failed step is not cited by a claim; it stays in the step log. Spyglass never
writes `observed`, the `observed` text of an inspection or the `outcome` of a
claim. You write them with `result set`:

```sh
spyglass result set --claim CLAIM_ID --outcome passed --observed "WHAT YOU SAW"
spyglass result set --claim CLAIM_ID --inspect 1280x800:ARTIFACT.png \
  --expected "WHAT SHOULD SHOW" --observed "WHAT THE IMAGE SHOWS"
spyglass result set --control CONTROL_ID --observed-failure "..." --observed-pass "..."
spyglass result set --gate GATE_NAME --outcome passed --step STEP_ID
```

An `--observed` after `--inspect` belongs to that inspection. `result set`
refuses an unknown claim, gate, control or step before it changes the file.

### See what is missing, and reuse a gate

`spyglass status --work --run ID` lists, for each claim, control and gate,
what is still missing. It uses the rules of `result --check`. A claim lists, for
example, `a passing step`, `independentRead: a later read after step 8a1f...`,
`visual inspection for screenshot 8a1f...-1-proof.png` and `observed text`.
`work.complete` is true when nothing is missing.

When an earlier run of the repository passed a planned gate on the same source
and profile, with its evidence kept and the same binding values, `up` writes
the gate into the pending result with its `run` and `steps`, and lists it in
`citedGates`. `up --cite-gates-from RUN` cites only that run and fails with
`GATE_CITATION_REJECTED` when it cannot cite a gate. `result set --gate-run RUN`
cites the planned gates of `RUN` in a run that already exists. `result` still
checks the citation.

### Output and exit codes

Default output is compact, indented text for people. `--json` gives one versioned
result object on stdout and diagnostics on stderr. The two modes use the same
handler and the same exit code.

| Exit code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Failed verification |
| `2` | Incorrect input |
| `3` | Environment failure |

`--run ID` selects a run across shell calls. You can also set `SPYGLASS_RUN`;
`--run` has priority. `spyglass status --run ID` shows the handoff state of a
run. Its `resultRules`, also in the output of `up`, list what this plan's claims,
controls and gates need in the result. `completedChecks.childExitCode` is the child process exit code;
`completedChecks.spyglassExitCode` is the Spyglass command exit code. A child
can exit zero while Spyglass rejects failed assertions. The earlier `exitCode`
and `commandExitCode` fields remain as aliases.

A visual result can use `inspections`, with one entry per viewport. Each entry
has `viewport`, `expected`, `observed` and `artifact`; the artifact must be a
valid screenshot from a cited step. The earlier single `inspection` remains
supported. Control templates include `failedRun`, initially the current run;
replace it when the intended failure belongs to a retained earlier run.

All worktrees of a repository share their runs. Put a fault in a separate
worktree, record its failing run there, and name that run in `failedRun`.
Run `down` for the fault run in its own worktree; Spyglass refuses commands
that change a run from another worktree (`RUN_OTHER_WORKTREE`). Keep the
fault worktree until the candidate report: its evidence folder holds the
failed attempt. Run IDs are unique in the repository. If a worktree is
removed while its run is active, `status` shows `worktreeRemoved` and `down`
stops that run from any worktree.

A gate can cite another run with `run`, for example one run that executes
the repository gates for several journeys. Its steps must have passed on the
same source identity, profile and bindings as the run that records the
result.

## Configuration

`spyglass init` writes a **profile** (`spyglass.json`). It contains the tools,
commands, bindings and evidence rules for one repository. Review the guessed
fields before you run `up`. See the [example profile](examples/demo.profile.json)
and the [example plan](examples/demo.plan.json).

The JSON schemas are in [`schemas/`](schemas). You can also print them:

```sh
spyglass schema profile
spyglass schema plan
spyglass schema result
```

### Lifecycle modes

A profile selects one lifecycle mode:

| Mode | Who starts and stops the app |
| --- | --- |
| `owned` | Spyglass starts a process group and stops it on `down`. |
| `external` | The repository's own tool starts and stops its resources. Spyglass records its doctor and checks. A named check with `cleanup: true` records the owner's cleanup. `down` closes only the Spyglass browser. |
| `none` | There is no persistent target, for example a library journey. |

For a long command, use `spyglass exec --timeout-ms 900000 --run ID -- COMMAND`.
The default is 300 seconds; the maximum is 24 hours. The selected deadline is
retained with the result. CLI binding overrides are retained with their resolved
values, including bindings added only on the command line.

### Credentials

Do not put credential values in a profile. Use references:

- `env:NAME`
- `file:path`
- `dotenv:path#KEY`
- `op://vault/item/field` (1Password CLI)

A **seat** is a named test identity with credential references. Screenshots can
contain private data. Examine the page state before you take one.

## Agent skills

The [`skills/`](skills) directory holds the agent skills for Spyglass. They
use the [Agent Skills](https://agentskills.io) format.

| Skill | Purpose |
| --- | --- |
| [`spyglass`](skills/spyglass/SKILL.md) | Run a verification with Spyglass. |
| [`create-verification-skill`](skills/create-verification-skill/SKILL.md) | Create a repository's own `verify-<app>` skill. |
| [`maintain-verification-skill`](skills/maintain-verification-skill/SKILL.md) | Keep that skill current as the app changes. |

Copy a skill folder into the skills directory of your agent harness, for
example `.claude/skills/` or `.agents/skills/`.

## Limitations

- Version 1 supports the surfaces in the table above. It has no native desktop,
  mobile or TUI driver. For those, use the repository's own checks and import
  their evidence.
- The browser accepts only the configured origins.
- Read-only database mode is not a sandbox for privileged functions. Use a
  restricted database role.
- An HTTP `202` response does not prove that background work finished. Wait
  for completion, then do an independent read.
- A run's browser stops after `browser.idleTimeoutMs` with no `ui` command
  (default: 1 hour). The next `ui` command reports `BROWSER_EXPIRED`, and a
  seat must sign in again. Run `down` when your checks are complete.

See [failure cases](docs/failure-cases.md) for the failures that the CLI must
detect, and [browser overhead](docs/browser-benchmark.md) for the measured cost
of browser commands.

## Development

```sh
npm ci
npm run build
npm test                          # end-to-end tests of the built CLI
SPYGLASS_TEST_SURFACES=1 npm test # also real Chromium and PostgreSQL in Docker
npm run format:check
```

The end-to-end tests run the built CLI in temporary Git repositories. They
need `agent-browser` on your `PATH`. The surface tests also need its Chromium
and Docker.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you
open a pull request. This project follows a [code of conduct](CODE_OF_CONDUCT.md).

To report a security vulnerability, follow [SECURITY.md](SECURITY.md). Do not
open a public issue.

## License

[MIT](LICENSE) © 2026 Matthew Schramm

The `create-verification-skill` and `maintain-verification-skill` skills are
adapted from [`cursor/plugins`](https://github.com/cursor/plugins)
(`pstack/skills`, commit `1dcc2ba`) by Lauren Tan, under the MIT license. Each
skill keeps its original `LICENSE` file.
