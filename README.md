<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Schramm2/spyglass/main/docs/assets/wordmark-white.png">
    <img src="https://raw.githubusercontent.com/Schramm2/spyglass/main/docs/assets/wordmark-black.png" alt="Spyglass" width="300">
  </picture>
</h1>

<p align="center"><strong>Verify code changes with real tools. Keep the proof.</strong></p>

<p align="center">
  <a href="https://github.com/Schramm2/spyglass/actions/workflows/ci.yml"><img src="https://github.com/Schramm2/spyglass/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mattschramm/spyglass"><img src="https://img.shields.io/npm/v/@mattschramm/spyglass" alt="npm version"></a>
  <a href="https://github.com/Schramm2/spyglass/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933.svg" alt="Node.js 24 or later">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Schramm2/spyglass/main/docs/assets/hero.png" alt="One run, drawn as a coastline: a browser lighthouse, an HTTP signal mast and a database hold lead by a dotted course to an open logbook of evidence that stays after cleanup." width="100%">
</p>

Spyglass is a command-line tool for coding agents and the people who review
their work. It connects browser actions, HTTP calls, database reads and
repository checks to one **run**. Each run records its source identity, every
attempt (failed attempts too) and its artifacts. The evidence stays after
cleanup, so another agent or person can inspect the result later without the
original chat or shell.

## Quick start

Install the package `@mattschramm/spyglass`; the command is `spyglass`. It needs
Node.js 24 or later and Git.

```sh
npm install --global @mattschramm/spyglass
spyglass --version
```

Then verify one change in your repository:

```sh
spyglass init                                   # write spyglass.json; review it
spyglass up --run my-change --plan verification-plan.json --json
spyglass check verify --run my-change --claim CLAIM_ID --json
spyglass result set --run my-change --claim CLAIM_ID --outcome passed --observed "WHAT YOU SAW"
spyglass finish --run my-change --json          # result, doctor, down and report
```

Add `.spyglass/` to your `.gitignore`. It holds the evidence folder.

The unscoped name `spyglass` is a different package. For a fixed version without
a global installation, use
`npm exec --yes --package=@mattschramm/spyglass@VERSION -- spyglass --version`.
The [install and keep a version][adopt] section covers an isolated prefix, a
source checkout, upgrades and rollback.

Run the [terminal quickstart][quickstart] to try the workflow on a local demo
app first. It takes approximately five minutes, records a deliberate failure
and a passing check, uses no paid services and keeps the report after cleanup.

## Why Spyglass

An agent can say "the tests pass" or "the page works". That statement is not
proof. Spyglass makes each verification step a recorded fact:

- **Real tools, no mocks.** A real browser, real HTTP requests, a real
  PostgreSQL database and the repository's own checks.
- **Evidence that stays.** Screenshots, responses, query rows and logs go to a
  Git-ignored evidence folder with checksums. Cleanup keeps them.
- **Honest results.** Failed attempts stay in the record. A report stays
  incomplete until each claim has a completed step and its evidence.
- **Source identity.** Each run records the commit and working-tree state.
  Evidence from changed source cannot prove the original source.
- **Safe by default.** The browser opens only configured origins, queries run
  in a read-only transaction, and reports mask credentials, cookies and
  authorization headers.
- **Built for agents.** Each command gives a versioned JSON result with
  `--json`, uses stable exit codes and never prompts.

Spyglass does not decide whether a claim covers the request, or whether a
screenshot looks correct. The **operator** (the agent or person) selects the
claims and judges the results. Spyglass makes sure that the cited steps
completed, the artifacts exist, the source is current and the cleanup is done.

## How a run works

1. **Plan.** Claims, controls, gates and limits are fixed when the run starts.
2. **Record.** Each command is a step with its own output, artifacts and
   checksums. A failed attempt stays in the log.
3. **Judge.** The operator records the outcome and observation for each claim,
   and cites the steps and artifacts that prove it.
4. **Finish.** Spyglass validates the result, checks the source, cleans up and
   writes an offline report.

## Documentation

| Guide                       | Contents                                                     |
| --------------------------- | ------------------------------------------------------------ |
| [Terminal quickstart][qs]   | Try the workflow on a disposable demo app.                   |
| [Adoption recipes][adopt]   | Install, plan and verify a real repository.                  |
| [Run a verification][usage] | Start, prove, record, finish and review a run.               |
| [Command reference][cmd]    | Surfaces, flags and recorded evidence.                       |
| [Configuration][config]     | Profile, lifecycle modes, bindings, credentials and seats.   |
| [Agent skills][skills]      | Skills that teach an agent to run and maintain verification. |
| [Review proof in CI][ci]    | Retain and review reports in GitHub Actions.                 |
| [Limitations][limits]       | What a successful run does not prove.                        |
| [Support][support]          | Tested platforms and tool versions, and setup diagnosis.     |
| [Failure cases][failures]   | Failures that the CLI must detect.                           |
| [Roadmap][roadmap]          | Priorities, checks and the next development task.            |
| [npm publication][publish]  | Maintainer procedure for a registry release.                 |

Run `spyglass --help` for all commands, and `spyglass COMMAND --help` for one
command.

## Requirements

- Node.js 24 or later, and Git.
- [`agent-browser`](https://www.npmjs.com/package/agent-browser) 0.38.2 and its
  Chromium for browser checks, Docker Compose for container status and logs,
  and a PostgreSQL database for database reads.
- No secret tool is necessary unless the profile uses `op://` references.

Spyglass does not install tools, fetch secrets or start your app during `init`.
The [support guide][support] lists tested configurations and unverified
platforms.

## Development

```sh
npm ci
npm run build
npm test                          # end-to-end tests of the built CLI
SPYGLASS_TEST_SURFACES=1 npm test # also real Chromium and PostgreSQL in Docker
npm run format:check
```

The end-to-end tests run the built CLI in temporary Git repositories. They need
`agent-browser` on your `PATH`; the surface tests also need its Chromium and
Docker. Development uses Git Flow: `dev` is the default integration branch and
`main` receives releases and urgent hotfixes. Read [CONTRIBUTING.md][contrib]
for setup, checks and the pull request process, and [agent_docs/ci.md][cicd]
for the CI evidence boundary.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md][contrib] before you open a
pull request. This project follows a [code of conduct][coc].

To report a security vulnerability, follow [SECURITY.md][security]. Do not open
a public issue.

## License

[MIT][license] © 2026 Matthew Schramm

The `create-verification-skill` and `maintain-verification-skill` skills are
adapted from [`cursor/plugins`](https://github.com/cursor/plugins)
(`pstack/skills`, commit `1dcc2ba`) by Lauren Tan, under the MIT license. Each
skill keeps its original `LICENSE` file.

[qs]: https://github.com/Schramm2/spyglass/blob/main/docs/quickstart.md
[adopt]: https://github.com/Schramm2/spyglass/blob/main/docs/adoption.md
[usage]: https://github.com/Schramm2/spyglass/blob/main/docs/usage.md
[cmd]: https://github.com/Schramm2/spyglass/blob/main/docs/commands.md
[config]: https://github.com/Schramm2/spyglass/blob/main/docs/configuration.md
[skills]: https://github.com/Schramm2/spyglass/blob/main/docs/agent-skills.md
[ci]: https://github.com/Schramm2/spyglass/blob/main/docs/ci.md
[limits]: https://github.com/Schramm2/spyglass/blob/main/docs/limitations.md
[support]: https://github.com/Schramm2/spyglass/blob/main/docs/support.md
[failures]: https://github.com/Schramm2/spyglass/blob/main/docs/failure-cases.md
[roadmap]: https://github.com/Schramm2/spyglass/blob/main/docs/roadmap.md
[publish]: https://github.com/Schramm2/spyglass/blob/main/docs/npm-publication.md
[contrib]: https://github.com/Schramm2/spyglass/blob/main/CONTRIBUTING.md
[cicd]: https://github.com/Schramm2/spyglass/blob/main/agent_docs/ci.md
[coc]: https://github.com/Schramm2/spyglass/blob/main/CODE_OF_CONDUCT.md
[security]: https://github.com/Schramm2/spyglass/blob/main/SECURITY.md
[license]: https://github.com/Schramm2/spyglass/blob/main/LICENSE
