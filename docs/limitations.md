# Limitations

Spyglass proves the behavior that a recorded step checked. A successful command
does not prove more than that.

- Version 1 supports the surfaces in the [command reference](commands.md). It
  has no native desktop, mobile or TUI driver. For those, use the repository's
  own checks and import their evidence.
- The browser accepts only the configured origins.
- Read-only database mode is not a sandbox for privileged functions. Use a
  restricted database role.
- An HTTP `202` response does not prove that background work finished. Wait
  for completion, then do an independent read.
- A run's browser stops after `browser.idleTimeoutMs` with no `ui` command
  (default: 1 hour). The next `ui` command reports `BROWSER_EXPIRED`, and a
  seat must sign in again. Run `down` when your checks are complete.
- Spyglass does not decide whether a claim covers the request, or whether a
  screenshot looks correct. The **operator** (the agent or person) selects the
  claims and judges the results.

See [failure cases](failure-cases.md) for the failures that the CLI must detect,
[browser overhead](browser-benchmark.md) for the measured cost of browser
commands, and [support](support.md) for tested platforms and tool versions.
