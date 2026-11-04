# CI

Read this before changing a workflow, selecting a required check or reviewing
CI evidence. Workflow files in `.github/workflows/` own the executable setup;
this guide owns the evidence boundary and failure diagnosis.

## Proof boundary

The core E2E suite drives the built CLI in temporary Git repositories. The
surface suite additionally drives real Chromium, HTTP, PostgreSQL and Docker
Compose. `agent_docs/testing.md` owns local setup and focused commands.

CI must run the real surface suite before a PR can merge. A green core suite
with surface tests skipped does not prove browser or database behavior.
Keep deliberate failures and their restored passes in retained evidence. A
screenshot is an artifact, not a visual verdict; an operator must open it
before making a claim about appearance.

## Gates and retained output

`.github/workflows/ci.yml` runs on PRs to `dev`, `main` and `release/*`,
pushes to `dev` and `main`, manual dispatch, and a weekly schedule. It has
no changed-path filter that can silently omit a surface check.

| Gate              | Purpose                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| PR branch policy  | Refuse invalid Git Flow source/target routes, including fork branches that impersonate long-lived back-merges |
| Default E2E       | Formatting, type-check/build, schema drift and the core built-CLI suite                                       |
| Real surface E2E  | Actual Chromium, HTTP, PostgreSQL and Compose checks                                                          |
| Secret scan       | TruffleHog scan of introduced history; full history on scheduled/manual runs                                  |
| Dependency review | Refuse new dependencies with moderate-or-higher known vulnerabilities; PR events only                         |
| CodeQL            | JavaScript/TypeScript security analysis and uploaded findings                                                 |
| CI required       | Fail unless every applicable gate succeeded; only dependency review may be skipped outside a PR               |

`CI required` is the protected-branch check. CodeQL findings appear in GitHub
code scanning; a successful analysis job means the analysis ran, not that the
code has no security defects. Review new findings as well as job status.

Each E2E job prints test results in its job log and uploads TAP and JUnit
output, including on failure when files exist. The surface job also uploads the checked visual journey's self-contained
report, two screenshots and provenance. These artifacts have 14-day retention.
They are examples of the actual suite's retained proof, not a report for every
test. A failure before the visual journey completes can leave only test logs.

## Ubuntu browser setup

Ubuntu 24.04 restricts unprivileged user namespaces for downloaded Chromium
builds. The real-surface job installs an AppArmor profile for only the exact
Chromium executables that the pinned `agent-browser` installer put in its
cache. It grants those binaries `userns` access, following Chromium's
[AppArmor guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
The global namespace restriction and Chromium sandbox stay enabled. The
profile exists only on the disposable hosted runner; CI does not change a
contributor's machine or pass `--no-sandbox`.

A `No usable sandbox` error is a runner setup failure, not a reason to skip
browser checks. Inspect the install path and profile-loading step first.
The first hosted attempts exposed this failure and their TAP/JUnit artifacts
remain in the PR run history.

## Review a run

1. Open the checks for the PR's current head, not an older successful commit.
2. Read each failed job's log. Separate a failed assertion from a missing tool,
   failed installation or unavailable service; do not weaken an expectation
   to make CI green.
3. Download the run's retained test output and evidence artifacts. Open the
   offline report and trace the affected claim to its recorded step. Keep
   source identity and cleanup results with the evidence.
4. Reproduce the failed check with the same tool versions and suite flags.
   Use a stable build; never run a build while another suite uses `dist/`.
5. Rerun only after a repair or an identified infrastructure fault. Record
   which one applies in the PR.

Artifacts have bounded GitHub retention. Download evidence needed for a
longer-lived decision before it expires. CI output is public: use only demo
credentials and public fixtures. Never upload a whole browser profile, the
runner environment, private target data or credential files.

## Changes to CI

Use least-privilege job permissions and pinned action commits. Dependabot
maintains action pins and npm updates through PRs into `dev`. Review the
actual version change as well as its passing checks.

The branch-policy check and protected branch settings work together:
`agent_docs/git-workflow.md` owns branch roles. Never use `pull_request_target`
to execute an untrusted contributor's code with write permissions or secrets.

Keep expensive performance studies separate from correctness gates. A shared
runner's timing does not establish the documented local browser budget or a
general operator speed claim. Historical cloud failures remain recorded until
a matching repeated run supplies resolution evidence.
