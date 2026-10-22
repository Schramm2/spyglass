# Security policy

## Supported versions

Spyglass is pre-release software. Only the latest commit on `main` receives
security fixes.

## Report a vulnerability

Do not open a public issue for a security vulnerability.

Report it privately through
[GitHub private vulnerability reporting](https://github.com/Schramm2/spyglass/security/advisories/new).
Include:

- the affected command or module;
- the steps to reproduce the problem;
- the effect, for example a credential that is not masked or a browser that
  opens an origin outside the allowlist.

You will get a reply within seven days. When a fix is available, the advisory
is published with credit to you, unless you ask for no credit.

## Scope

These are examples of security problems in Spyglass:

- a credential, cookie or authorization header in a report, log or artifact;
- a browser action that reaches an origin outside the profile allowlist;
- a database query that writes data or runs more than one statement;
- an evidence import that reads a file outside its declared import root.

Read-only database mode is not a sandbox for privileged database functions.
Use a restricted database role. See the limitations in the
[README](README.md#limitations).
