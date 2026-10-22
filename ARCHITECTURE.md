# Architecture

## Purpose and boundary

Spyglass is a single Node CLI that an operator runs inside a **target
repository** to verify a change. It owns the run record, the step log, the
artifacts and their checksums, the claim and gate validation, and the offline
report. It also owns the processes it starts: the app in `owned` mode, its
supervisor and the browser proxy.

It does not own the target: the repository's profile, checks, owner tools,
containers and databases stay with that repository. The browser is
`agent-browser`, an external CLI that Spyglass calls. Spyglass does not judge
whether a claim covers the request or whether a screenshot looks right; the
operator does (see `GLOSSARY.md`).

## Codemap

All runtime code is in `src/`. Each command loads only the module it needs.

| Path | Owns | Search for |
| --- | --- | --- |
| `src/cli.ts` | Option parsing, command dispatch, the run lock, the JSON envelope and exit codes | `emit`, `known`, `allowed` |
| `src/help.ts` | Help text for each command | `commandHelp` |
| `src/schema.ts` | The version 1 profile, plan and result schemas (zod) | `profileSchema`, `planSchema`, `resultSchema`, `validate` |
| `src/export-schemas.ts` | Build step that writes `schemas/*.schema.json` | |
| `src/profile.ts` | Profile discovery (`init`), location, loading and `${...}` templates | `init`, `locateProfile`, `loadProfile`, `template` |
| `src/state.ts` | Run and step records, source identity, the lock and the per-command `Context` | `Run`, `Step`, `Artifact`, `Context`, `source`, `assertSource`, `lock`, `stateRoot` |
| `src/lifecycle.ts` | `up`, `status`, `doctor` and the owned-process stop | `allocate`, `launch`, `doctor`, `status`, `capabilities`, `stopOwned` |
| `src/supervisor.ts` | Separate process that holds the owned app's process group and writes its masked log | |
| `src/process.ts` | Child commands with bounds, and process identity checks | `runCommand`, `processIdentity`, `processGroupMembers` |
| `src/checks.ts` | `check`, `exec`, `evidence add` and assertion parsing | `checks` |
| `src/browser.ts` | `ui`: calls `agent-browser`, seats and sign-in, screenshots | `browser`, `browserDoctor`, `closeBrowsers` |
| `src/browser-proxy.ts` | Separate process: an exact-origin HTTP proxy for the run browser | `ensureBrowserProxy`, `stopBrowserProxy` |
| `src/surfaces.ts` | `api`, `db`, `ps`, `logs` and `mark` | `surfaces`, `readDatabaseRole` |
| `src/report.ts` | `result` validation and `report` (JSON summary and HTML page) | `report` |
| `src/secrets.ts` | Secret reference resolution and masking | `Secrets` |
| `src/files.ts` | Safe paths, hashing and JSON I/O | `safePath`, `beneath`, `hash` |
| `src/errors.ts` | The `Fault` error with code, next action and exit code | `Fault`, `fault` |
| `skills/` | The agent skills that teach operators to use the CLI | |
| `tests/e2e/`, `fixtures/demo-app/` | E2E tests and the app they drive | |

## Main flow

1. **Init.** `init` reads the target repository and writes a proposed
   `spyglass.json` with the provenance of each guessed field. It starts
   nothing.
2. **Up.** `allocate` validates the profile and plan, reserves a port,
   creates the run directory and the evidence folder, and records the source
   identity. `launch` then starts the app through the supervisor (`owned`),
   or runs the owner's readiness check (`external`), and waits for readiness.
   The run becomes `ready` or `failed`.
3. **Drive.** Each later command takes the run lock, creates a `Context` with
   a new step, checks the source identity (except for `ui`) and calls its
   module. Modules write artifacts through `Context.artifact`. `Context.finish`
   appends the step to `spyglass/log.jsonl` in the evidence folder, also when
   the command fails.
4. **Result.** The operator fills the pending result file that `up` wrote,
   and `result` validates it against the plan and the step log.
5. **Doctor and down.** `doctor` rechecks the source, tools and owner.
   `down` closes the browser sessions and proxy, stops the owned process
   group and sets the run to `stopped`. In `external` mode, a check with
   `cleanup: true` records the owner's cleanup.
6. **Report.** `report` rechecks every cited step and artifact checksum,
   writes `index.html` and a summary into the evidence folder, and exits with
   a failed status while required proof or cleanup is missing.

Authoritative state changes in step 2 (run record and source identity), at
each `Context.finish` (step log), in step 4 (result) and in step 5 (run
state).

## Processes

| Process | Started by | Lifetime | Talks to |
| --- | --- | --- | --- |
| `spyglass` CLI | The operator | One command | Run state, evidence folder, the processes below |
| Supervisor (`dist/supervisor.js`) | `up` in `owned` mode, detached | Until `down` | The app child; writes `launch.log` and `app-state.json` |
| Browser proxy (`dist/browser-proxy.js --serve`) | The first `ui` command, detached | Until `down` or browser idle timeout | HTTP to the allowed origins only |
| `agent-browser` daemon and Chromium | `agent-browser`, one session per seat | Until `down` or `browser.idleTimeoutMs` | Pages through the proxy |

The build keeps `browser-proxy` and `supervisor` as separate entry points
because they run as their own processes. The `ui` hot path is a separate
bundle to meet the browser overhead budget in `docs/browser-benchmark.md`.

## State and data ownership

| Fact | Owner and location |
| --- | --- |
| Run record, lock, browser proxy config | `$XDG_STATE_HOME/spyglass/<repo hash>/<run>/` (default `~/.local/state`), outside the repository |
| Step log, artifacts, result, report, app log | The evidence folder in the target repository, default `.spyglass/runs/${run}`, which must be Git-ignored |
| Profile, checks, containers, databases | The target repository |
| Secret values | Their references (`env:`, `file:`, `dotenv:`, `op://`); never stored |

## Invariants and boundaries

| Rule | Enforced by |
| --- | --- |
| Every mutating command holds the run lock; a second one fails with `RUN_BUSY` and `status` stays available | `lock` in `src/state.ts`, E2E tests |
| Evidence from changed source cannot pass for the recorded source | `assertSource`, `report` checks, E2E tests |
| A failed step stays in the log; nothing removes log entries | `Context.finish` appends only; not otherwise enforced |
| Text and JSON written through `Context` are masked; images are not | `Secrets`, `Context.artifact`, E2E tests |
| The browser reaches only the configured origins | `src/browser-proxy.ts` and `--allowed-domains` in `src/browser.ts`; surface tests |
| `db` runs one statement in a read-only transaction | `src/surfaces.ts`; surface tests |
| HTTP redirects are not followed | `src/surfaces.ts` |
| Profiles hold secret references, never literal credentials | `secretReference` in `src/schema.ts`, E2E tests |
| The evidence folder stays Git-ignored | `allocate` and `doctor` in `src/lifecycle.ts` |
| JSON output is one versioned envelope; the CLI never prompts | `emit` in `src/cli.ts`, E2E tests |
| Generic modules contain no paths or names from a target repository | Not enforced; review |
| `src/cli.ts` imports command modules lazily | Not enforced; `docs/browser-benchmark.md` measures the effect |

Runtime dependencies are `pg` and `zod` only. `agent-browser`, Docker Compose
and the 1Password CLI (`op`) are external tools that Spyglass calls; it does
not install them. `doctor` records the versions of `agent-browser` and
Compose when the profile needs them.
