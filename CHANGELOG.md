# Changelog

This file records the notable changes to Spyglass. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-10-24

### Added

- `up` and `status` return `resultRules`: the rules that `result` enforces for
  this plan, named by claim, control and gate. The result template also holds
  an empty `independentRead` for each side-effect claim and an empty
  `inspections` list for each visual claim.

### Fixed

- A gate cited from another run compares only the binding overrides that its
  steps used. Every step uses the bindings of a launch that Spyglass owns. An
  `exec` gate uses no other binding, and a named check also uses the bindings
  its definition names, including through `web` and `api`. Runs with their
  own installation ports, under an external launch, can now share one gate
  run. A changed binding that a step used still fails the result and names
  the binding.
- Each run keeps its profile as hashed, before templates. A cited gate reads
  the bindings its steps used from the run, not from a profile file that can
  change later. For a run from 1.1.0, Spyglass reads the file, and every
  changed binding counts when the file differs.

## [1.1.0] - 2026-10-23

### Added

- `ui focused [--expect LABEL]` records the focused element's role, label,
  type and ID without its value. `--expect` fails when the label differs.
- A gate in a result can name `run`: another run of the repository whose
  steps prove the gate. The steps must have this run's source identity.

### Changed

- All worktrees of a repository share one run store, so a control's
  `failedRun` can name a run from a fault worktree, and run IDs are unique
  in the repository. A command that changes a run must run from that run's
  own worktree; otherwise it fails with `RUN_OTHER_WORKTREE`. `status` marks
  a run whose worktree was removed with `worktreeRemoved`, and `down` stops
  it from any worktree. Runs that a linked worktree started before this
  change stay in that worktree's own store: find and stop them there.
- A control whose failed run's evidence folder was removed, for example with
  its worktree, names that folder in the result failure.
- A gate from another run must also have the same profile and bindings.

### Fixed

- The owned-app supervisor no longer recreates a removed evidence folder
  when the app stops.
- `status` reports `sourceError` for a run whose worktree cannot be read,
  instead of failing for every run.

## [1.0.0] - 2026-10-23

### Added

- Multiple viewport inspections in each visual claim, each linked to its
  screenshot from a cited step. The single inspection remains supported.
- Clear `childExitCode` and `spyglassExitCode` fields in completed checks.
  The earlier fields remain as aliases.
- `failedRun` in each control template, initially the current run ID.
- `exec --timeout-ms` for long commands, with a maximum of 24 hours.
- `report` output includes `reportPath`, the absolute path of the HTML page.
- The terminal quickstart explains what the result file is for.

### Changed

- Retained profile bindings now include resolved CLI overrides and added values.
- Default CLI output uses compact text instead of formatted JSON.
  `--json` and schema output keep their structured formats.

- `report` uses only a result recorded with `spyglass result`. An edited
  result file that was not recorded leaves the report incomplete with
  `RESULT_MISSING`.
- `status` names `spyglass result` as the next command while the run has a
  plan and no recorded result.

## [0.1.0] - 2026-10-22

### Added

- The `spyglass` CLI with runs, profiles, plans, claim results, offline
  reports and checksums for artifacts.
- Surfaces: repository checks, recorded commands, browser (`agent-browser`),
  HTTP, read-only PostgreSQL, Docker Compose status and logs, and evidence
  import.
- Lifecycle modes `owned`, `external` and `none`.
- Version 1 JSON schemas for the profile, plan and result.
- The agent skills `spyglass`, `create-verification-skill` and
  `maintain-verification-skill`.

[Unreleased]: https://github.com/Schramm2/spyglass/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Schramm2/spyglass/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Schramm2/spyglass/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Schramm2/spyglass/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Schramm2/spyglass/releases/tag/v0.1.0
