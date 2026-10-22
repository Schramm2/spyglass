# Spyglass

Spyglass is a CLI that verifies code changes with real tools and keeps the
evidence. A coding agent or a person starts a **run** in a target repository,
drives checks, browser, HTTP, PostgreSQL and Compose through it, records claim
results, and gets an offline report that stays after cleanup. A successful
command is evidence for one step; it is not proof of a behavior it did not
check.

This repository is public under MIT. Never put credentials, browser state,
private application data, local machine paths or internal project names in
Git. If a local, untracked `.plans/` folder exists, read its current plan
before work, and never commit it or quote it in tracked files.

## Stack and layout

TypeScript on Node 24, ESM, bundled by esbuild. Runtime dependencies are `pg`
and `zod` only.

- `src/`: the CLI. `src/cli.ts` parses options and dispatches each command to
  its module. `ARCHITECTURE.md` maps the modules.
- `src/schema.ts`: the version 1 profile, plan and result schemas.
- `schemas/`: JSON Schema files **generated** from `src/schema.ts` by
  `npm run build` and committed. Edit `src/schema.ts`, rebuild, and commit both.
- `tests/e2e/`: end-to-end tests of the built CLI in temporary Git
  repositories. `fixtures/demo-app/`: the app those tests and the quickstart
  drive.
- `skills/`: the source of truth for the `spyglass`,
  `create-verification-skill` and `maintain-verification-skill` agent skills.
  Edit them here. Keep each adapted skill's `LICENSE` file.
- `docs/`: user docs and the failure cases the CLI must detect.
- `examples/`: the example profile and plan that the README links.
- `landing/`: the static landing page. Its CLI output and report states are
  real output of the quickstart demo. Replace them only with new real output.

## Commands

```sh
npm ci
npm run build          # type-check, bundle to dist/, regenerate schemas/
npm test               # build, then the E2E tests in tests/e2e/
npm run format:check   # Prettier on src, tests, fixtures, examples, landing
npm run format         # fix the format
```

`npm test` needs `agent-browser` 0.38.2 on `PATH`. CI
(`.github/workflows/ci.yml`) runs `format:check` and `npm test`. The real
browser and PostgreSQL tests are opt-in; see `agent_docs/testing.md`.

## Rules for every change

- Write the failure case and its E2E test before the implementation. Test
  observable behavior through the public CLI, real tools and retained evidence.
- Keep generic modules free of paths or names from a specific target
  repository. A repository profile owns its integration details.
- Keep source identity, failed attempts and cleanup records. A change must not
  let a failed or stale step pass as proof.
- Use main as the integration branch and deliver changes through a pull
  request. Commit only reviewed, intended paths. Preserve unrelated work.
- Before you push, run the build, the tests, `format:check` and the secret
  scan in `agent_docs/delivery.md`.
- Do not publish to npm unless the user asks for it.

## Agent docs

Read the relevant documents before you start work:

- `GLOSSARY.md`: the Spyglass domain terms. Read before you name a concept in
  code, output, schemas or docs.
- `ARCHITECTURE.md`: the module map, the run flow, the processes, where state
  lives and the invariants. Read before you add a command, move code between
  modules or change where state lives.
- `agent_docs/testing.md`: how the E2E suite works, the opt-in surface tests
  and how to add or focus a test. Read before you write or run tests.
- `agent_docs/delivery.md`: what a user-visible change must update, generated
  schemas, pre-push checks and the secret scan, version strings and the
  publication boundary. Read before you change a command, output or schema,
  push, or release.
- `docs/failure-cases.md`: the failures the CLI must detect. Read before you
  change verification, evidence or cleanup behavior, and add a row for a new
  failure case.
- `docs/browser-benchmark.md`: the 150 ms budget for each `ui` command and the
  build choices that meet it. Read before you change `ui`, the browser proxy
  or the build script.
- `CONTRIBUTING.md`: the contributor workflow for people. `README.md` and
  `docs/quickstart.md`: the user-facing contract for commands and output.
