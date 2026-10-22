---
name: create-verification-skill
description: Create a project-owned verification skill and feature map that use Spyglass with the repository's own tools and lifecycle.
disable-model-invocation: true
---

# Create a verification skill

Create a project-owned `verify-<app>` skill so the next agent can verify the
app from a cold start. Use Spyglass for claims, checks, run state, and evidence.
Keep the repository's own commands in charge of its installations, databases,
and services.

## 1. Read the repository

Read repository instructions, README, manifests, task runners, existing
verification skills, and feature maps. Read the relevant source for each
user-facing surface. Answer these questions from the repository; ask the user
only for facts the code cannot supply:

- **Surface:** what does the user touch: web UI, API, CLI or TUI, desktop app,
  mobile app, library, or several of these?
- **Owner:** which existing command prepares, checks, and cleans up an
  installation, database, service, or test identity? What resource ID proves
  the run owns it?
- **Drive:** which public path can exercise the behavior? Use Spyglass's
  `agent-browser` session for UI journeys; keep existing browser tests, API,
  CLI, and library-facade journeys as named checks when they prove other
  behavior.
- **Observe:** which independent reads, screenshots, responses, logs, or
  structured results prove each expected result?
- **Isolate:** how can runs avoid a person's session, production, shared
  databases, and each other's state?

If the repository already has a verification skill, preserve its proven
journeys and owner commands. Identify missing or stale coverage before editing.
If the app cannot start or the owner check fails, record the concrete failure;
do not describe the app as verified.

## 2. Add a Spyglass profile and claim plan

Read the installed CLI reference and schemas:
`spyglass --help`, `spyglass schema profile`, and `spyglass schema plan`. In the
Spyglass source, use `schemas/profile.schema.json` and
`schemas/plan.schema.json`; use `examples/demo.profile.json` and
`examples/demo.plan.json` for the current shape. Follow the installed CLI
version when syntax differs.

If Spyglass is not installed, follow the [Spyglass README](https://github.com/Schramm2/spyglass)'s terminal setup, then check
`spyglass --version` before creating the profile.

Run `spyglass init` when the repository has no profile. Review each proposed
field and its provenance. Correct guesses from the owner's documentation and
commands before starting a run. Configure only the capabilities needed by the
selected journeys. Add the evidence directory to `.gitignore` when required.

Keep the repository owner in control of setup and cleanup. Use Spyglass's
external launch mode to bind an owner-managed target. Add named checks for
repeatable owner journeys and declare their structured result and artifacts.
Use `exec` for a trusted owner command that has no named check. Spyglass records
these operations; it does not replace the owner's lifecycle or authority.

Write a claim plan before driving. Each claim names the behavior, user entry
point, preconditions, expected result, a relevant case, the named check, and
required evidence. Include the affected consumer and a failure path. List
excluded paths and their reasons. Mark guessed values as guesses until a live
check confirms them.

Resolve credentials through secret references. Keep secret values out of the
profile, plan, skill, feature map, helper, terminal arguments, and evidence.

## 3. Write the skill and feature map

Write `SKILL.md` with `name: verify-<app>` and a description that names the app,
its main surface, and when to use the skill. Keep it available to agents. Give
the next agent the exact owner setup, readiness, drive, independent-read, and
cleanup steps. Use the same Spyglass CLI that a person can run in a terminal.

Create `features/README.md` and files for the top three to five user-facing
features, selected from routes, commands, menus, or library operations. Include
every changed feature and affected entry point. Keep each map user-focused and
follow the examples in
[`references/feature-map-example/README.md`](references/feature-map-example/README.md)
and [`create-note.md`](references/feature-map-example/create-note.md):

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with <harness>`
4. `Gotchas`

For each user action, give the exact command or interaction and the observable
result. Use stable accessible names, API paths, CLI prompts, or facade calls.
Keep changing command syntax in Spyglass help and profile schemas; the local
skill records only the repository's actual recipe.

Drive browser actions through Spyglass's owned browser session. Use existing
Playwright, Cypress, or repository journeys as named checks when they cover
specialist behavior. Do not build a second control CLI or write a throwaway
drive script. Add a narrow reusable adapter only when a required operation is
missing, then prove that adapter on the real target.

## 4. Prove one journey

Before handoff, use the new skill, profile, and claim plan to run at least one
complete user journey:

1. Prepare an isolated target with the repository owner's setup command.
2. Run the owner's read-only Doctor and Spyglass Doctor.
3. Drive the mapped user entry point and wait for asynchronous work to finish.
4. Read each claimed side effect through a separate read-only view.
5. Open and inspect actual screenshots with the current harness's image viewer;
   record the viewport, expected state, and observed state. If no operator can
   inspect the image, mark that visual claim blocked.
6. Save the outcome and evidence, then clean up through the owner command and
   Spyglass. Confirm evidence remains after cleanup.

Keep failed attempts. Repair setup or the recipe, then repeat the affected
claim against the final source. A screenshot file, successful command, request
acceptance, or source review alone does not prove the journey.

If a claim or check changes, use an isolated negative control to show that the
intended assertion fails. Restore the target and show that the same expectation
passes. Record a precise limit when a safe control is unavailable.

If no fresh agent is available, read the skill as a new operator and remove
steps that rely on chat history. Record that fresh-agent discovery remains
untested.

## 5. Hand off

Report the skill and map paths, the proven claim and evidence, source identity,
owner and Spyglass cleanup results, failed attempts, unverified paths, and
limits. Name `maintain-verification-skill` as the upkeep pass when the app or
its tools change. State whether a fresh agent followed the skill successfully.
