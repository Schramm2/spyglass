# Delivery

This doc covers what happens after a change works: generated files, the checks
before a push, the pull request, version strings, the changelog and the
publication boundary. Read it before you push, change a schema, bump the
version or prepare a release. `agent_docs/git-workflow.md` owns branch roles
and back-merges; use that guide to select the base and target.

## Generated and pinned files

| File                    | Source                                                                            | Rule                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `schemas/*.schema.json` | `src/schema.ts`, written by `src/export-schemas.ts` at the end of `npm run build` | Never edit by hand. Rebuild and commit the regenerated files with the schema change.                             |
| `dist/`                 | `npm run build`                                                                   | Git-ignored. `package.json` `bin` points to `dist/cli.js`, so rebuild before you run the CLI from this checkout. |
| `package-lock.json`     | `npm install`                                                                     | Change only with a dependency change.                                                                            |

The tested `agent-browser` version is pinned in several places. Change all of
them together: `.github/workflows/ci.yml`, `src/lifecycle.ts:409`,
`src/profile.ts:280`, `README.md`, `CONTRIBUTING.md`,
and `agent_docs/testing.md`.

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
trufflehog git file://. --since-commit origin/dev --branch HEAD --results=verified,unknown --fail
```

The example secret scan checks commits outside `origin/dev`. For a release
or hotfix, replace that reference with the PR target (`origin/main`); for a
back-merge, use its target. CI also scans the PR's introduced history. Keep
the local scan as an earlier check. If `trufflehog` is unavailable, install
it or report that the local scan did not run; do not report it as passed.

Also check the diff for content that a scanner cannot find: local machine
paths, internal project or company names, private application data and
screenshots. This repository is public.

Some maintainer-only files can exist in a local checkout and be excluded
through `.git/info/exclude`. Leave them untracked. Stage paths by name, not
with `git add -A`.

## Pull request

Follow `agent_docs/git-workflow.md`: ordinary changes start from and return
to `dev`; only release and hotfix promotions enter `main`. Fill in
`.github/pull_request_template.md`: what changed, why, and how you verified
it. Name the checks you ran and any unavailable check. Use merge commits.

Private run evidence and browser state stay ignored. Sanitized evidence
from public fixtures may be committed under `bench/results/` when it is an
intended deliverable. Review its contents, screenshots and checksums; a
successful secret scan alone does not prove it is safe to publish.

## Version and release

Change every copy of the version string together. Find them with
`grep -rn '"X.Y.Z"\|X\.Y\.Z' package.json package-lock.json src README.md tests`:

- `package.json` and the two `version` fields of `package-lock.json`;
- `src/cli.ts` (`--version` output), `src/state.ts` (the tool identity in
  each step record) and `src/lifecycle.ts` (the tool identity in `doctor`);
- the step record assertion in `tests/e2e/core.test.mjs`;
- `README.md`.

The grep can also match a dependency in `package-lock.json` that has the same
version; leave that one unchanged.

Move the `[Unreleased]` entries in `CHANGELOG.md` to a new version heading and
update the compare links at its end. A new command, option or output field is
a minor release; a fix only is a patch. Prepare this on `release/X.Y.Z`
from `dev`, or `hotfix/X.Y.Z` from `main` for an urgent release fix. Merge
its PR into `main`, then complete the back-merge in the workflow guide.
Tag the merged release commit on `main` as `vX.Y.Z`; the default branch
`dev` is not the release target.

A GitHub release, when the user asks for one, has two assets. Build them from
the tag and check them after upload:

```sh
git archive --format=tar.gz --prefix=spyglass-X.Y.Z/ vX.Y.Z > spyglass-X.Y.Z-source.tar.gz
shasum -a 256 spyglass-X.Y.Z-source.tar.gz > spyglass-X.Y.Z-SHA256SUMS
gh release create vX.Y.Z --verify-tag --target main --title "Spyglass X.Y.Z" --notes-file NOTES.md --latest \
  spyglass-X.Y.Z-source.tar.gz spyglass-X.Y.Z-SHA256SUMS
gh release download vX.Y.Z && shasum -a 256 -c spyglass-X.Y.Z-SHA256SUMS
```

Then build the extracted archive with `npm ci && npm run build` and check that
`node dist/cli.js --version` prints the new version.

`package.json` permits public publication of `@mattschramm/spyglass`. This is
configuration, not permission to write to npm. Follow
[`docs/npm-publication.md`](../docs/npm-publication.md) for the protected
staging workflow, first-package setup, maintainer approval and registry checks.
Staging creates public registry state for a new package and needs explicit
approval too. Create release tags or a GitHub release only when requested.

## Agent skills

`skills/` is the source of truth for the three Spyglass skills. Other skill
catalogs install a copy pinned to a commit of this repository, so a skill
change reaches them only after they update the pin. Keep each adapted skill's
`LICENSE` file.
