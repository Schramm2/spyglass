# Platform and external-tool support

This page separates requirements from tested configurations. A version range
in `package.json` is not proof that every version and platform works. Use
[adoption](adoption.md) for installation, upgrades and setup repairs.

## Requirements and boundaries

| Component            | Requirement                                       | Boundary                                                                                                                     |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Spyglass runtime     | Node.js 24 or later; Git on `PATH`                | ESM CLI; no interactive prompts. The target check can use a different runtime.                                               |
| Package installation | npm with source builds or a locally built archive | npm registry publication remains disabled (`private: true`).                                                                 |
| Browser              | `agent-browser` 0.38.2 and its installed Chromium | Required at `up` when the profile declares `web`; Chromium is required for `ui`. Other browser-tool versions are unverified. |
| HTTP                 | Node's fetch                                      | No external HTTP client; redirects are not followed.                                                                         |
| Database             | PostgreSQL; bundled `pg` driver                   | Read-only transactions, one prepared statement; use a restricted role. Privileged functions remain a limit.                  |
| Containers           | Running Docker and `docker compose`               | Only the profile's project and files; owner tools retain lifecycle authority.                                                |
| Secrets              | `env:`, `file:`, `dotenv:`; `op` for `op://` only | No secret tool needed for unrelated checks. No credential values in profiles or arguments.                                   |

For browser setup:

```sh
npm install --global agent-browser@0.38.2
agent-browser install --with-deps
agent-browser --version
```

Use the repository's installation policy if it does not permit global tools.
Do not disable the Chromium sandbox to repair a Linux launch failure. The
[CI guide](../agent_docs/ci.md#ubuntu-browser-setup) describes the narrow
Ubuntu AppArmor rule used on disposable runners.

## Tested configurations

| Configuration                                                                                                            | Evidence                                                                                                                                                                            | Limits                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubuntu 24.04 source candidate, Node 24, `agent-browser` 0.38.2, Chromium, PostgreSQL 17 through Compose                  | [M3 closing CI record](../bench/results/m3/hosted/41867158951/README.md): 89 core and 25 real-surface checks passed; [M3 review](review-m3.md) records source identities and limits | Only the recorded source and tools are covered, not every Node 24 patch or a released build. M1's historical cloud overhead and first-frame failures are not resolved by this correctness run. |
| macOS 27.0.1 arm64, Node 24.11.1, npm 11.6.2, Git 2.56.0; `agent-browser` 0.38.2, Chromium, Compose 5.5.0, PostgreSQL 17 | [M2 adoption record](adoption-m2.md) and retained 89 core plus 25 real-surface E2E outcomes                                                                                         | Only the recorded targets and tool paths are covered. Agent trials, not human-use evidence.                                                                                                    |
| Target checks on a separate runtime                                                                                      | M2's Kleur check used Node 16.20.2 while Spyglass stayed on Node 24                                                                                                                 | Compatibility repair for an old target runner, not support for running Spyglass on Node 16.                                                                                                    |

Windows, other architectures, other Node majors, alternative browser tools
and alternative container engines have no M2 acceptance evidence. Treat them
as unverified, not supported by inference. Native desktop, mobile and TUI
drivers are not included; use repository-owned checks and declare limits.

## Known workflow limits

The [sustained-use review](usage-review.md) records browser proof timeouts on
some sheets and development previews. A tested browser/tool configuration
does not prove every page can be captured. These are observed adapter gaps,
not diagnosed causes for every failed screenshot. Preserve the failure and
report the visual claim as blocked when no image can be inspected. Do not
attach to another browser or widen allowed origins as a repair.

Owners can retain offline reports outside removed worktrees, but CLI state
can still point to the original evidence path. Keep the report, artifacts,
producing scripts and a checksum manifest together before removing a
worktree. Do not assume a successful `status` means relocated evidence was
found or validated. Direct retained-folder inspection and safer retention
are planned in [M3.1](roadmap.md#m31-harden-the-current-workflow), not promised
by the current CLI.

## Diagnose a setup failure

1. Record the platform, tool versions, exact command, JSON envelope and exit
   code. Preserve the failed run if one was allocated.
2. Read `error.next`, retained launch/check output and repository instructions.
   A package manager or runner failure is not a failed product assertion.
3. Confirm the target runtime separately from the Spyglass runtime. Keep
   pinned package managers and lockfiles; do not silently substitute tools.
4. For a browser profile, confirm the exact pinned tool and its Chromium.
   For Compose or database work, confirm only the tools that surface needs.
5. Clean up failed runs. After changing source, profile, dependencies or build
   inputs, start a new run and repeat affected proof.

Report an unsupported configuration with these facts and its retained
findings. Do not estimate an unmeasured result or mark an unavailable surface
as passing.
