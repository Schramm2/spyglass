# Changelog

This file records the notable changes to Spyglass. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `result --check` applies the rules of `result` and records nothing.
  `result` and `result --check` return every finding at once in
  `data.findings`. Each finding has a `repair`, the next action that clears
  it, and names the claim, gate or control. Schema errors in the result file
  are findings too.
- `result` needs no `--file`: it reads the pending result of the run
  (`resultPath`).
- `--claim ID`, `--independent-read`, `--control ID:failed|restored` and
  `--gate NAME` on `ui`, `api`, `db`, `check`, `exec` and `evidence add` link
  a finished step into the pending result: the step ID, its artifacts, the
  later read, and the failed and restored steps of a control. Spyglass never
  writes `observed`, an inspection's `observed` text or a claim `outcome`.
  Steps run with these flags show `data.linked`.
- `result set` edits the pending result with flags: claim outcome and
  observation, inspections, steps, gates, controls, operator and limits.

- `ui expect` polls one or more conditions inside one call (`--url`, `--text`,
  `--title`, `--selector`, `--visible`, `--hidden`, `--enabled`, `--checked`,
  `--count`, `--focused`, `--attr`, `--no-errors`) until `--timeout-ms`
  (default 5000). It writes `expect.json`, records each condition as an
  assertion and exits 1 with the last observation when one never holds.
- `--settle` on one `click`, `dblclick`, `press`, `fill`, `select`, `type` or
  `find ... click` waits for the navigation and DOM changes that the action
  starts, without waiting for network idle.
- A selector action that matches no element returns `data.nearest`, up to 10
  interactive roles and names from the page, and keeps the page snapshot.

- `ui verify` runs the actions (`--open`, `--do`), expectations (`--expect`),
  an optional focus check (`--expect-focus-moved LABEL`) and a proof
  (`--proof LABEL`, with `--viewport WxH` for each viewport) as one step with
  ordered sub-steps. The first failure keeps the sub-steps before it as
  passed, saves a failure screenshot and a delta snapshot, and marks the rest
  `not run`.
- `ui proof LABEL` takes `--viewport WxH` (repeatable) and `--expect`: it
  resizes, settles, checks the expectations and saves
  `proof-LABEL-WxH.png` for each viewport.
- With `--claim ID` on a visual claim, a step that captured viewports adds an
  inspection for each, with `viewport` and `artifact` and empty text for you.
- `result` reports `EXPECTATION_FAILED`, `EXPECTATION_NOT_RUN`,
  `ACTION_FAILED` and `ACTION_NOT_RUN` when a claim cites a batch step with a
  failed or skipped sub-step.

### Changed

- `ui` reports the last URL of a command batch as `currentUrl`, not the first.

### Fixed

- A screenshot of a page that has not drawn a frame no longer waits about 10
  seconds for the first frame in a headless browser. Spyglass makes the page
  draw before each screenshot.
- The run's browser proxy no longer ends when a browser resets a connection.
  An error on a proxy socket had no handler, so one reset ended the proxy
  process and the next browser command failed with
  `BROWSER_PROXY_UNAVAILABLE`, in about one run in ten on a loaded machine.
  The error text now says whether the proxy gave no answer or answered as
  another process.

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
