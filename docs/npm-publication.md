# Publish Spyglass to npm

The package is `@mattschramm/spyglass`. Its executable is `spyglass`. The unscoped
`spyglass` package belongs to another project. Publication configuration does
not mean a version is available: check the public registry after approval.

## Maintainer setup

1. Sign in to [npm](https://www.npmjs.com/). Confirm that the account owns the
   `mattschramm` user scope. The GitHub owner stays `Schramm2`; it does not
   select the npm scope. Enable npm 2FA.
2. Confirm the first version through the Git Flow release process. Do not
   publish an old version just because it is in a development checkout. If
   an existing release lacks this setup, prepare a new patch release.
3. Create the GitHub environment **npm** in repository Settings → Environments.
   Restrict deployment to `main`. Require maintainer approval. Disable
   self-approval if the repository's plan and reviewer arrangement permit it;
   with one maintainer, npm's separate 2FA approval remains the final boundary.
   Do not configure an `NPM_TOKEN` secret.
4. Protect release tags (`v*`) against unauthorized creation, replacement and
   deletion. Branch protection alone does not protect tags.

Complete these steps before enabling the workflow. The environment is server
configuration; committing `environment: npm` does not configure its protection.

## First package: interactive bootstrap

Trusted-publisher settings belong to an existing npm package. The first stage
creates a **public `0.0.0-stage` placeholder**. Candidate contents remain
private until approval. Both staging and final publication need explicit
maintainer approval; neither is a local dry run.

After the approved release PR merges into `main`, its exact-source CI passes
and its approved tag exists, use a clean checkout of that tag:

```sh
npm install --global npm@11.15.0
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm ci
candidate=$(mktemp -d)
npm pack --json --pack-destination "$candidate" > "$candidate/manifest.json"
# Set ARCHIVE to the exact .tgz path in this manifest. Do not select a wildcard.
node scripts/check-package.mjs "$ARCHIVE" "$candidate/proof"
npm stage publish "$ARCHIVE" --dry-run --ignore-scripts --access public --tag latest
# REGISTRY WRITE: run only after explicit approval of the version and placeholder.
npm stage publish "$ARCHIVE" --ignore-scripts --access public --tag latest
```

Use `--tag next`, not `latest`, for a prerelease. The pinned npm version
supports staging; older local npm versions might not. Interactive login and
2FA stay in the maintainer's terminal. Never paste a token or OTP into chat.
`npm whoami` above checks interactive login, not OIDC authorization.

Inspect the stage ID printed by npm:

```sh
npm stage view STAGE_ID
npm stage download STAGE_ID
# Review the downloaded archive against the checked archive and manifest.
# PUBLICATION: approve only the inspected candidate, with 2FA.
npm stage approve STAGE_ID
```

The npm website's **Staged Packages** tab can also review and approve it.
Preserve the candidate, manifest, proof and stage ID. A failed attempt stays
in the release record. An existing published version cannot be overwritten.

## Configure trusted publishing

In the package's npm Settings → Trusted Publisher, select GitHub Actions:

| Field | Value |
| --- | --- |
| Organization or user | `Schramm2` |
| Repository | `spyglass` |
| Workflow filename | `publish.yml` |
| Environment | `npm` |
| Allowed actions | Staging only; leave direct publication and dist-tag changes disabled |

Configure this when the next release is ready; npm expires a new unused
configuration after its activation window. After OIDC succeeds, require 2FA
and disallow traditional publishing tokens in the package's publishing-access
settings. Trusted publishing does not need a long-lived npm token. Public
GitHub-to-public-npm OIDC publication adds provenance automatically.

## Later releases: checked archive through OIDC

Run **npm publication** (`.github/workflows/publish.yml`) manually on `main`.
Select the approved release tag and `latest` (stable) or `next` (prerelease).
The selected tag must identify the current `main` commit, not an older
ancestor: this keeps the workflow's OIDC provenance source equal to the source
that built the archive. Use the workflow before another change reaches `main`.

The workflow checks a merged release/hotfix PR into `main`, tag/version
identity, the latest successful push CI for that exact source (including real
surfaces), public package settings, version absence and the prerelease tag.
It installs dependencies, packs once, installs that archive without scripts
in an isolated prefix, runs a command-only claim and control, cleans up and
reopens the report. It retains the manifest, archive, installed-command output
and checksummed evidence for 14 days, including available failure output.

The protected `npm` job downloads that same archive, verifies SHA-512 against
the preparation job and stages it with npm 11.15.0 and OIDC. It does not rebuild
or approve. A maintainer then inspects and approves it on npm with 2FA.
Download evidence needed beyond GitHub's retention period.

A failed or duplicate stage is not permission to change the version, tag or
source silently. Review the existing stage first. The default E2E suite tests
the package-install gate; it does not exercise npm authorization or a registry
write. The publication workflow requires a real hosted run before OIDC can be
reported as verified.

## Verify the public version

After approval, in a clean checkout of the release tag:

```sh
npm view @mattschramm/spyglass@VERSION dist --json
node scripts/check-package.mjs @mattschramm/spyglass@VERSION .spyglass/npm-registry-proof
npm install --global @mattschramm/spyglass@VERSION
spyglass --version
```

Compare the registry's `dist.integrity` with the checked archive's manifest.
Check `dist.attestations` and npm's provenance display for OIDC releases;
interactive bootstrap does not establish OIDC provenance. Inspect the report
and keep the registry response with the release evidence. Verify the expected
dist-tag with `npm view @mattschramm/spyglass dist-tags --json`.

Finish the required `main` → `dev` back-merge. Registry approval does not
replace Git Flow release completion. This gate covers command-only archive
installation, not browser/database behavior or untested operating systems.

## npm references

- [Staged publishing](https://docs.npmjs.com/staged-publishing)
- [Trusted publishers](https://docs.npmjs.com/trusted-publishers/)
- [Public scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
