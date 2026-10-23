# Delivery

This doc covers what happens after a change works: generated files, the checks
before a push, the pull request, version strings, the changelog and the
publication boundary. Read it before you push, change a schema, bump the
version or prepare a release.

## Generated and pinned files

| File | Source | Rule |
| --- | --- | --- |
| `schemas/*.schema.json` | `src/schema.ts`, written by `src/export-schemas.ts` at the end of `npm run build` | Never edit by hand. Rebuild and commit the regenerated files with the schema change. |
| `dist/` | `npm run build` | Git-ignored. `package.json` `bin` points to `dist/cli.js`, so rebuild before you run the CLI from this checkout. |
| `package-lock.json` | `npm install` | Change only with a dependency change. |

The tested `agent-browser` version is pinned in several places. Change all of
them together: `.github/workflows/ci.yml`, `src/lifecycle.ts:255`,
`src/profile.ts:294`, `README.md`, `CONTRIBUTING.md` and
`agent_docs/testing.md`.

## User-visible changes

A new or changed command, option, output field, exit code or schema field
changes the public contract. In the same pull request:

- add an entry under `[Unreleased]` in `CHANGELOG.md`;
- update the command table or text in `README.md`, and the help in
  `src/help.ts`;
- update the skill text in `skills/` that names the command or field.

The version number changes only at release time; see "Version and release".

## Before you push

Run these from the repository root. All must pass:

```sh
npm run build
npm test
npm run format:check
trufflehog git file://. --since-commit origin/main --branch HEAD --results=verified,unknown --fail
```

The secret scan checks the commits on your branch that are not on
`origin/main`. CI does not run a secret scan yet, so this local scan is the
only one. If `trufflehog` is not installed, install it or report that the
scan did not run.

Also check the diff for content that a scanner cannot find: local machine
paths, internal project or company names, private application data and
screenshots. This repository is public.

Some maintainer-only files can exist in a local checkout and be excluded
through `.git/info/exclude`. Leave them untracked. Stage paths by name, not
with `git add -A`.

## Pull request

Use a branch from `main` named by type, for example `fix/...`, `feat/...` or
`docs/...`, and Conventional Commit subjects (`fix:`, `feat:`, `docs:`,
`ci:`). Fill in `.github/pull_request_template.md`: what changed, why, and
how you verified it. Name the checks you ran and the checks you could not
run, such as the opt-in surface tests.

## Version and release

The version string is in five places. Change all of them together:

- `package.json` `version`
- `src/cli.ts:169` and `src/cli.ts:170` (`--version` output)
- `src/state.ts:305` (the tool identity in each step record)
- `src/lifecycle.ts:368` (the tool identity in `doctor`)

`tests/e2e/core.test.mjs:1750` asserts the step record version, and
`README.md` names the current version. Move the `[Unreleased]` entries in
`CHANGELOG.md` to a new version heading and update the compare links at its
end. Tag the release commit `vX.Y.Z`.

`package.json` has `"private": true`. Spyglass is not on npm. Do not publish
it, remove `private` or create a GitHub release unless the user asks for it.

## Agent skills

`skills/` is the source of truth for the three Spyglass skills. Other skill
catalogs install a copy pinned to a commit of this repository, so a skill
change reaches them only after they update the pin. Keep each adapted skill's
`LICENSE` file.
