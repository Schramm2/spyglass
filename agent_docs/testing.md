# Testing

This doc covers the end-to-end (E2E) suite: what it runs, what it needs and
how to add or focus a test. Read it before you write, change or run tests.

## The model

Every test runs the **built** CLI (`dist/cli.js`) as a child process in a new
temporary Git repository. Tests assert on the JSON envelope, the exit code and
the files that a run retains. They do not import modules from `src/`. A test
that needs an internal function is a sign that the behavior is not observable
yet; make it observable through the CLI first.

`npm test` runs `npm run build` first, so a test always runs against the
current source. To rerun tests without a rebuild, run `node --test` directly
(see "Focus one test").

## Files

| File | Covers |
| --- | --- |
| `tests/e2e/helper.mjs` | Shared helpers: `makeRepo`, `removeRepo`, `runCli`, `startCli`, `assertEnvelope`, `baseProfile`, `readRunFile`, `waitFor`, `spawnCapture` |
| `tests/e2e/core.test.mjs` | Run lifecycle, checks, evidence, source identity, claims, controls, reports, locks and errors. Needs no browser or Docker. |
| `tests/e2e/surfaces.test.mjs` | Real Chromium through `agent-browser`, HTTP, PostgreSQL and Compose. Opt-in. |
| `fixtures/demo-app/` | The app under test: `server.mjs` (HTTP app), `check.mjs` (a named check that passes or fails on request), `compose.yaml` (PostgreSQL 17) |
| `docs/failure-cases.md` | The failure cases the suite must cover |

`makeRepo` (`tests/e2e/helper.mjs:15`) copies the demo fixture into a
temporary directory, writes `.gitignore`, `package.json`, an optional
`spyglass.json` profile and `plan.json`, and commits a baseline. Call
`removeRepo` in a `finally` block; it removes the directory and its state home.

`startCli` (`tests/e2e/helper.mjs:104`) sets `XDG_STATE_HOME` to a directory
beside the temporary repository, so run state never touches your own
`~/.local/state/spyglass`. Keep that isolation in new helpers.

`baseProfile` (`tests/e2e/helper.mjs:67`) gives an owned demo app with a
`${port}` binding, a web and API origin, a source scope and a browser
allowlist. Override fields with its argument.

## Requirements

| Suite | Needs |
| --- | --- |
| `npm test` (default) | Node 24, Git, `agent-browser` 0.38.2 on `PATH`. `up` runs `agent-browser --version` for any profile with a `web` origin, so most core tests fail with `TOOL_UNAVAILABLE` without it. |
| Surface tests | The above, plus Chromium for `agent-browser` and a running Docker with Compose. Set `SPYGLASS_TEST_SURFACES=1`. |

Without `SPYGLASS_TEST_SURFACES=1`, the surface tests show as skipped with
the reason. CI does not run them. The surface tests start their own
PostgreSQL from `fixtures/demo-app/compose.yaml` and set
`SPYGLASS_TEST_DATABASE_URL` and `SPYGLASS_TEST_API_TOKEN` themselves; you do
not supply them.

```sh
npm install --global agent-browser@0.38.2
SPYGLASS_TEST_SURFACES=1 npm test
```

## Focus one test

Build once, then run one file or a name pattern:

```sh
npm run build
node --test --test-concurrency=1 tests/e2e/core.test.mjs
node --test --test-concurrency=1 --test-name-pattern='source change' tests/e2e/core.test.mjs
```

`npm test` runs the files one at a time (`--test-concurrency=1` in
`package.json`). Keep that setting when you add a test file.

## Add a test

1. Add or find the row in `docs/failure-cases.md` for the failure the change
   must detect.
2. Write the test in the file for its area, with a name that states the
   observable result, for example "a source change blocks later evidence from
   claiming the original run is current".
3. Run it and see it fail on the current CLI for the expected reason.
4. Implement the change, then run `npm test`.

Assert the envelope with `assertEnvelope(result, { ok, code })`. It checks
that stdout holds exactly one JSON object and gives stdout and stderr in the
failure message. Assert on retained files (`readRunFile`) when the behavior
is about evidence.

Extend the existing test files and the demo fixture first. A new test file,
helper or fixture needs the maintainer's agreement in the pull request.

## What a passing suite does not prove

The default suite does not drive a real browser or database. A change to
`src/browser.ts`, `src/browser-proxy.ts` or the `db`, `ps` and `logs` paths in
`src/surfaces.ts` needs `SPYGLASS_TEST_SURFACES=1 npm test`. If you cannot run
it, say so in the pull request.
