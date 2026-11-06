# npm installation and publication research

## Outcome: 1.4.1 published

This is the historical research that preceded the first npm release. Its
original scope and repository-state findings below are not current installation
instructions. Use [the README](../README.md#install) to install Spyglass
and [the publication procedure](npm-publication.md) for future releases.

The maintainer confirmed the npm account `mattschramm`, not `schramm2`.
The approved package is **`@mattschramm/spyglass`**; the command stays
**`spyglass`**. Version `1.4.1` was staged with npm `11.15.0`, inspected, then
approved by the maintainer with 2FA on 2026-11-05.

- [Setup PR #33](https://github.com/Schramm2/spyglass/pull/33) added the public
  package configuration, archive-install gate and staged-publication workflow.
- [Release PR #34](https://github.com/Schramm2/spyglass/pull/34) merged as
  `2141a6474b5af9358576e4d6d717eaa54dfe7c86`; tag `v1.4.1` points to it.
  [Exact-source CI](https://github.com/Schramm2/spyglass/actions/runs/42031655983)
  passed, including real surfaces.
- [Back-merge PR #35](https://github.com/Schramm2/spyglass/pull/35) returned the
  release to `dev`.
- The public registry archive matched the checked release archive. A fresh-cache
  installation passed command-only verification, the failed/restored control,
  cleanup and report reopening. The [public installation receipt](https://github.com/Schramm2/spyglass/pull/34#issuecomment-6658780734)
  records the checks and their limits.
- The first release used interactive staging and maintainer approval, not OIDC.
  Trusted-publisher and protected-environment configuration remain necessary
  before later automated releases. No OIDC provenance is claimed for `1.4.1`.

Published archive integrity:

```text
sha512-OVgFzd4SqS5t618mAmhGlio9lmLq9EMl2YjRBcGYnm80gIVzUwdFtkhfxj1wNjHFE6jmRo4IlsMsU9hw5/B3Yg==
```

An install immediately after approval returned `ETARGET`; later public registry
reads and a fresh-cache installation passed without another submission. A
separate `EEXIST` came from the old local `@schramm2/spyglass@1.4.0` package,
which still owned the executable. Uninstalling that old package and installing
`@mattschramm/spyglass@1.4.1` resolved the collision without `--force`.

## Original decision

Keep the package name `@schramm2/spyglass` and the command name `spyglass`.
Prepare a package-install E2E gate, then add a protected GitHub Actions
publication workflow. Prefer npm trusted publishing (OIDC) with staged
publication and a separate maintainer approval.

This document records research and local package checks. It does not authorize
publication, staging on npm, release tags or a GitHub release. No publication
settings were changed during this research.

## Repository state at research time

| Area                   | Finding                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package                | `package.json` declares `@schramm2/spyglass`, version `1.4.0`, ESM and Node `>=24`.                                                                       |
| Publication block      | `"private": true` makes npm refuse publication. Keep it until publication preparation is approved. [1]                                                    |
| Executable             | `bin.spyglass` points to `dist/cli.js`; the source and built file have the Node shebang. npm uses `bin` for global and local executable installation. [1] |
| Build                  | `prepack` runs the build, including TypeScript checks, ESM bundles and schema generation. npm runs `prepack` when packing a local source directory. [2]   |
| Runtime                | `pg` and `zod` are runtime dependencies. Browser, Docker and secret tools remain external.                                                                |
| Archive                | The `files` allowlist includes the runtime, schemas, skills and selected public guidance.                                                                 |
| CI                     | `.github/workflows/ci.yml` checks the source but has no npm publication job.                                                                              |
| Existing package check | `tests/e2e/core.test.mjs` checks the dry-run archive allowlist. It does not install that archive and drive a run.                                         |
| Documentation          | `README.md`, `docs/adoption.md`, `docs/support.md` and `agent_docs/delivery.md` still state that npm publication is disabled.                             |

The public npm registry already has an unrelated package named `spyglass`.
Its current registry response identifies a value-inspection library, not this
CLI. Do not recommend `npm install -g spyglass` or `npx spyglass`. [3]

The registry returned HTTP 404 for `@schramm2/spyglass` during this research.
That means no public package was returned; it does **not** prove that the
current operator owns the npm scope or can publish that name. Confirm npm
account access before the first registry operation. [4]

## Installation after publication

Global installation:

```sh
npm install --global @schramm2/spyglass
spyglass --version
```

Pinned execution without a global installation:

```sh
npm exec --yes --package=@schramm2/spyglass@VERSION -- spyglass --version
```

Replace `VERSION` with the approved published version. Repository-local use:

```sh
npm install --save-dev --save-exact @schramm2/spyglass@VERSION
npm exec -- spyglass --version
```

The scoped package name does not require a scoped command name: the existing
`bin` map keeps the command `spyglass`. [1, 5]

Node 24 or later remains a prerequisite. Browser work still requires the
separate supported `agent-browser` installation and its Chromium. Installing
Spyglass must not install browser binaries, fetch secrets or start a target.

## Publication configuration

At the approved preparation step, remove `private` and add:

```json
{
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

Scoped public packages need public access on their first publication.
`publishConfig` makes the intended registry and access explicit. [1, 6]
Keep the existing `files`, `bin`, `engines` and `prepack` settings.
Do not add an install-time build or browser-download script.

Select the first npm version through the existing release process. A checkout
that prints `1.4.0` is not by itself proof that `1.4.0` is the approved release.
Do not overwrite a published package version: npm versions are immutable. [7]

## Recommended security model

Use a GitHub-hosted runner, Node 24 and an explicitly selected, tested npm
version. Trusted publishing requires npm `>=11.5.1` and Node `>=22.14.0`.
Staged publication requires npm `>=11.15.0`; the locally checked npm `11.6.2`
is too old for that mode. [8, 9]

Configure npm's trusted publisher with these exact values:

| Setting              | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| Organization or user | `Schramm2`                                                     |
| Repository           | `spyglass`                                                     |
| Workflow filename    | `publish.yml`                                                  |
| Environment          | `npm` (create and protect it in GitHub)                        |
| Allowed action       | Staging only, unless direct publication is separately approved |

The workflow needs `contents: read` and `id-token: write` on its publication
job. Use pinned action commits, as required by this repository. Keep write
permission out of ordinary PR jobs. Do not add a long-lived `NPM_TOKEN` for
normal releases. [8]

Trusted publishing from a public GitHub repository to a public npm package
adds provenance automatically. An explicit `--provenance` flag is not needed
for that path. The package's repository URL must match the GitHub repository.
Do not copy token-authentication examples into the OIDC workflow. [8]

### First package setup

npm documents trusted-publisher setup through an existing package's settings.
It also documents staged publication for new packages: the first stage creates
a **public `0.0.0-stage` placeholder**. The candidate contents remain private
until approval. Staging is therefore a registry publication boundary, not a
safe local dry run. It needs explicit permission. [8, 9]

Recommended sequence after approval:

1. Confirm control of the npm account for scope `@schramm2` and enable 2FA.
2. Prepare and verify the release candidate locally and in CI.
3. Use interactive npm authentication to stage the first approved candidate
   from a clean release checkout. Do not put credentials in Git or chat.
4. Inspect and approve the staged candidate with 2FA. Alternatively, use an
   explicitly approved interactive first publication if staging is unsuitable.
5. Configure the package's trusted publisher for the protected workflow.
6. Use OIDC staging for later releases. A maintainer reviews and approves each
   candidate with 2FA through npm's website or CLI.
7. After OIDC works, set package publishing access to require 2FA and disallow
   traditional tokens. This does not disable trusted publishing. [8]

Do not assume a first package can use OIDC before its package settings exist.
The documented sources do not establish a pre-registration path for that case.
A new trusted-publisher configuration must complete a successful publication
within two days or it expires; create it when the next release is ready. [8]

Direct `npm publish` through OIDC is a simpler alternative. It needs explicit
permission in the trusted-publisher settings. Staging is preferred here because
it preserves a separate approval before the candidate becomes installable. [8, 9]

## Required package and workflow checks

Implement the failure cases and E2E checks before changing behavior, in line
with the repository testing guide:

1. An archive that cannot run without the source checkout must fail the gate.
   Pack once, install into an isolated prefix with install scripts disabled,
   and drive the installed executable from a separate temporary repository.
2. Missing bundles, proxy files, schemas, skills or runtime dependencies must
   fail. Check version, help and schema output, then a command-only run through
   cleanup and offline report generation.
3. A package with local plans, evidence, credentials or unrelated files must
   fail. Keep the existing archive allowlist check.
4. A release tag outside `main`, a tag/version mismatch, an unapproved tag or
   a candidate without passing required checks must not reach publication.
5. A prerelease must not move `latest`. Select its dist-tag explicitly.
6. A second attempt to publish an existing version must not silently succeed
   or pick a different source.

Run the existing core and real-surface CI gates for the release source. A
package-install check does not replace browser or database evidence.

Suggested publication flow:

- Trigger only through the approved release process, not an ordinary push to
  `dev`. Explicitly select the release tag; the default branch is not `main`.
- Verify the tag is the approved release commit on `main`, and that its
  package version matches the tag. Check the required gates on that source.
- Use a clean checkout and `npm ci`, then build and check the package.
- Retain the archive manifest, integrity, installed-command output and
  checksummed report as public, sanitized CI artifacts.
- Stage the exact checked archive rather than rebuild a different archive
  for publication. Confirm the selected npm version's archive staging path
  with a local CLI check before implementing it.
- Require the protected `npm` environment, with no self-approval where the
  repository's GitHub plan permits that protection.
- Approve on npm, then install the exact version from the public registry in
  a new directory and repeat the command-only check.
- Verify the registry integrity and provenance. Complete the existing Git Flow
  back-merge; npm publication does not replace release completion.

OIDC does not authorize every npm command. In particular, `npm whoami` is not
a valid test of trusted-publishing permission. Dist-tag changes through OIDC
need a newer CLI and separate permission; do not assume staging permission
also permits them. [8]

## Local checks completed

Checked with Node `24.11.1` and npm `11.6.2`:

- `npm pack` ran `prepack`; TypeScript checks, bundles and schema generation
  passed.
- The archive contained 47 files, with an unpacked size of 532,365 bytes.
- Installed the archive into an isolated temporary prefix with
  `--ignore-scripts`. npm installed its runtime dependencies.
- The installed executable printed version `1.4.0`, returned help successfully
  and emitted parseable profile-schema JSON.
- The existing focused E2E archive-allowlist check passed: one check, no skips.
- The build did not change tracked generated files.

Archive integrity:

```text
sha512-1Y4jaBrLtV80z7atpKspmJpTaja+LsdOv6rVWu8RGthoo3V8COZHeG85ShIksJkWkTZGYGt165fJYEHQfcb7hw==
```

These checks establish local archive installation and basic CLI entry points
only. They do not establish npm ownership, registry publication, OIDC,
provenance, a complete installed verification run or cross-platform support.
No full E2E suite, surface suite or registry write was run for this research.

## Documentation and design repairs

Prepare these changes with the implementation:

- Update installation, support, upgrade and release guidance in `README.md`,
  `docs/adoption.md`, `docs/support.md` and `agent_docs/delivery.md`. Reconcile
  the npm restriction in `AGENTS.md` with the approved publication policy.
- The archive README uses relative images and links to files not in the
  allowlist. Review its rendering on npm. Use absolute repository links for
  unshipped documentation and images, or deliberately include the necessary
  public assets. Do not include the whole asset directory without review.
- `docs/adoption.md` still gives `1.3.1` archive examples while the package is
  `1.4.0`. Replace these with a clear version-selection rule or update them at
  release time.
- Version identity is repeated across the manifest, lockfile, CLI and run
  records. Keep the existing coordinated version checklist; consider a
  separate future change to generate version identity from one source.

## Inputs needed before registry changes

- Confirmation that `@schramm2/spyglass` is the intended npm name and the
  maintainer controls that npm scope.
- The version selected for the first npm publication.
- Approval for registry staging/publication, including the public placeholder
  if staged publication is used.
- Maintainer participation for npm login, 2FA and package settings.

Implementation can be prepared without a registry write. Ordinary setup work
belongs on a branch from `dev`; release-only preparation follows the current
release branch rules. Preserve unrelated local files.

## Sources

Context7 was used to resolve `/npm/cli` and `/websites/npmjs` and query package
metadata and trusted publishing. The live npm pages below were checked because
some Context7 examples still show token-based publication, while current npm
trusted-publishing guidance specifies tokenless OIDC and automatic provenance.

1. [npm package.json: bin, private, files and publishConfig](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)
2. [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts)
3. [Public registry: unrelated spyglass package](https://registry.npmjs.org/spyglass)
4. [Public registry: scoped Spyglass name](https://registry.npmjs.org/@schramm2%2fspyglass)
5. [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec)
6. [Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
7. [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish)
8. [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/)
9. [Staged publishing for npm packages](https://docs.npmjs.com/staged-publishing)
