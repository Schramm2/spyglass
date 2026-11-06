# Spyglass

Spyglass is a CLI that verifies code changes with real tools and keeps the
proof after cleanup. An operator selects claims and judges behavior; the CLI
records and validates the mechanical evidence. A successful command proves
only the behavior it checked.

## Layout

TypeScript on Node 24, ESM, bundled by esbuild. Runtime dependencies are `pg`
and `zod`; browser, Compose and secret tools stay external.

- `src/`: CLI, adapters, run state and offline report.
- `schemas/`: committed JSON Schemas generated from `src/schema.ts`.
- `tests/e2e/` and `fixtures/demo-app/`: built-CLI checks and their real target.
- `landing/`: the static public landing page; no build step.
- `skills/`: source of truth for the three Spyglass skills; keep their licenses.
- `bench/`: scripted comparisons and approved public evidence.

## Work boundaries

This repository is public under MIT. Keep credentials, browser state, private
application data, internal project names and personal machine paths out of Git.
Local, ignored `.plans/` files can supply context, but shared instructions and
completion evidence must live in tracked documents. Read the current local plan
when present; never copy its private content into tracked files.

Preserve source identity, failed attempts and cleanup records. Generic modules
must not contain integration paths or names from a target repository; the
profile owns those details. Keep unrelated work unchanged and stage intended
paths only.

## Build and verify

Use `npm ci` for setup, `npm run build` for type-checking, bundles and generated
schemas, `npm test` for E2E checks, and `npm run format:check` for formatting.
Read the testing guide before running or changing checks. Implement a behavior
change only after its failure case and E2E check fail for the intended reason.

Use Git Flow: ordinary work branches from `dev` and returns through a pull
request. Read the workflow before branch, merge or release work. Publication
and release tags need explicit user approval. Follow `docs/npm-publication.md`
for npm staging, approval and registry installation checks.

## Agent docs

Read the relevant documents before starting work. This file is the shared
repository instruction source; task-specific rules stay in the documents below.

- `GLOSSARY.md`: domain terms; read before naming concepts in code or prose.
- `ARCHITECTURE.md`: module ownership, run flow and invariants; read before changing structure, commands or state ownership.
- `FRONTEND.md`: offline report engineering; read before changing a browser-facing surface.
- `DESIGN.md`: implemented visual intent and surface exceptions; read before changing appearance or UI copy.
- `agent_docs/testing.md`: E2E setup, focused checks and failure-first changes; read before running or changing tests.
- `agent_docs/git-workflow.md`: branch roles, PR targets and protected merges; read before Git or GitHub delivery work.
- `agent_docs/delivery.md`: generated files, public contracts, scans and releases; read before changing output, pushing or releasing.
- `agent_docs/ci.md`: workflow gates, retained artifacts and failure diagnosis; read before changing CI or reviewing its evidence.
- `docs/failure-cases.md`: failures the CLI must detect; read before changing evidence, verification or cleanup behavior.
- `docs/browser-benchmark.md`: browser overhead budget and build choices; read before changing `ui`, its proxy or the build.
- `docs/verification-speed.md`: speed targets and proof; read before changing tool driving, evidence recording or result validation.
- `docs/roadmap.md`: current priorities and completion limits; read before selecting milestone work.
- `CONTRIBUTING.md`: public contributor entry point; read before preparing a contribution.
- `README.md`, `docs/quickstart.md`, `docs/usage.md` and `docs/commands.md`: public command and operator contracts; read before changing the documented workflow.
- `docs/configuration.md`, `docs/limitations.md` and `docs/support.md`: public profile, limit and platform contracts; read before changing them.
