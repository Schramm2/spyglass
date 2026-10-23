# Changelog

This file records the notable changes to Spyglass. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/Schramm2/spyglass/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Schramm2/spyglass/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Schramm2/spyglass/releases/tag/v0.1.0
