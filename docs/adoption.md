# Adopt Spyglass in an existing repository

Use the repository's checks and lifecycle tools. Do not replace its test
runner or add a Spyglass runtime dependency to the target app. A first useful
report has a named claim, a detected intended failure, a restored pass, source
identity, limits and completed cleanup. A successful `up` is not that report.

The [terminal quickstart](quickstart.md) is a disposable demonstration. The
recipes below describe adoption. Replace the example commands and expectations
with commands and assertions that the target repository already owns. Read
its instructions before you execute them.

## Install and keep a version

After the first npm release is approved, install an exact public version:

```sh
npm install --global @mattschramm/spyglass@VERSION
# Or keep it in the target repository's development dependencies:
npm install --save-dev --save-exact @mattschramm/spyglass@VERSION
npm exec -- spyglass --version
```

Replace `VERSION` with an approved published version. Until that approval,
use a source checkout pinned to an approved release tag. See the
[README](https://github.com/Schramm2/spyglass#installation). Do not install from
a moving branch when repeatability matters. Record:

```sh
node --version
npm --version
git --version
spyglass --version
```

Record the Spyglass source commit too, from its checkout:

```sh
git rev-parse HEAD
git status --short
```

An isolated installation avoids a global `npm link`. In the **Spyglass source
checkout**, after `npm ci` and `npm run build`:

```sh
install_root=$(mktemp -d /tmp/spyglass-install.XXXXXX)
npm pack --pack-destination "$install_root"
# Use the exact .tgz path printed above, not a wildcard over old packages.
npm install --ignore-scripts --prefix "$install_root/tool" "$install_root/ARCHIVE.tgz"
"$install_root/tool/node_modules/.bin/spyglass" --version
export PATH="$install_root/tool/node_modules/.bin:$PATH"
```

Replace `ARCHIVE.tgz` with the exact filename printed by `npm pack`.
This is local packaging, not npm publication. A candidate can have the same
version as an earlier build; retain its source commit, working-tree changes
and archive SHA-256. A version alone does not identify an unreleased candidate.
Review the package contents with `npm pack --dry-run` before distributing it.

For an npm upgrade or rollback, install the selected exact version again.
For source or archive installations, keep the old checkout or isolated prefix.
Install the new tag in another location and build it when using source.
Check `--version`, command help and the release notes before changing `PATH`. Do not change CLI builds during an
active run. Complete or clean up old runs with their original build first.
Start a new run with the new build; never reuse old evidence as proof of an
upgrade. To roll back, restore the old `PATH` or run its CLI by absolute path.
The archive contains the built runtime, schemas and public guidance, not a
source checkout. Run source builds in the original Git checkout.
No schema migration or cross-version run compatibility is promised by this
recipe. Version 1 schemas do not by themselves prove that compatibility.

## Select a recipe

| Target                                                     | Lifecycle mode | Check and cleanup owner                                             |
| ---------------------------------------------------------- | -------------- | ------------------------------------------------------------------- |
| Existing suite, CLI or library without persistent services | `none`         | Existing runner; Spyglass closes only its own resources             |
| Web app that permits a separate process per run            | `owned`        | Spyglass starts and stops the app; repository checks stay unchanged |
| Repository-owned installation or library host              | `external`     | Existing owner starts, checks and cleans up its isolated resources  |

Run `spyglass init --json` in the target Git repository. Review the proposed
profile and all guessed fields. Discovery does not install dependencies,
start servers or prove readiness. Do setup and builds **before** `up`.
Add `.spyglass/` to `.gitignore` before a run. Keep generated runner output
ignored too; otherwise a check that writes it can change the source identity.
Do not ignore product source to make a check pass.

## Keep the proof scope explicit

A complete report proves the claims in its plan, not the whole repository's
completion rules. Name required gates in the plan or link their validated
owner evidence in the repository's completion record. A limit explains
missing coverage; it does not waive a required check.

Use `behavior` for a read-only state observation. A write or persistence claim
needs `side-effect`, its recorded action and a later independent read. A GET
of previously saved state alone proves no write. Keep real action/read
assertions from supported owner journeys; do not replace them with exit
status or invent a second read.

A synthetic false runner assertion can prove that Spyglass rejects that
assertion. It is not a control of the product's fault detection. For a product
control, introduce the declared fault and keep the unchanged check's failing
and restored passing attempts. Declare either an assertion ID or the exact
command plus expected failure; prose in `expectation` is not an assertion ID.

The [sustained-use review](usage-review.md) records why these distinctions
matter and which workflow repairs remain planned.

## Recipe 1: existing suite, CLI or library

Use `none` when the check needs no persistent target. This complete profile
adopts an existing `npm test` command as `verify`:

```json
{
  "version": 1,
  "app": "library-checks",
  "launch": { "mode": "none" },
  "checks": {
    "verify": {
      "command": ["npm", "test"],
      "timeoutMs": 300000,
      "result": "exit"
    }
  }
}
```

Use the repository's actual package manager or command, for example
`["make", "test"]` or `["cargo", "test"]`. `result: "exit"` proves the
command's exit condition, not that every test ran. Inspect the retained output
for skips and coverage limits. If the runner already produces supported JSON
assertions, use `result: "json"` and declare its artifacts and import roots;
do not discard those assertions in favor of exit status. Use
`spyglass check --help` for the accepted formats.

Write `verification-plan.json` before `up`. This example has one claim and
one command-level control. Replace `EXPECTED_ASSERTION_TEXT` with a stable
failure message from the repository's real check. A missing dependency,
syntax error or unrelated launch failure is not a valid intended failure.

```json
{
  "claims": [
    {
      "id": "existing-check",
      "behavior": "The existing repository check accepts the candidate.",
      "entryPoint": "npm test",
      "precondition": "Dependencies and build are ready.",
      "expected": "The existing assertions run and pass.",
      "case": "Normal candidate and deliberate fault.",
      "checks": ["verify"],
      "evidence": ["Runner output and exit status"],
      "kind": "behavior"
    }
  ],
  "controls": [
    {
      "id": "detects-fault",
      "claim": "existing-check",
      "expectation": "The unchanged check detects the selected product fault.",
      "command": ["check", "verify"],
      "failure": {
        "code": "CHECK_FAILED",
        "contains": "EXPECTED_ASSERTION_TEXT"
      }
    }
  ],
  "gates": [],
  "limits": [
    "This claim covers the selected check, not every product entry point."
  ]
}
```

Use the [control procedure](#record-the-failure-without-changing-an-active-runs-source)
below, then finish with the shared result commands. No browser, HTTP origin,
Docker or database is necessary for this recipe.

## Recipe 2: an isolated web app

Use `owned` only when the repository permits Spyglass to start a separate app
process and stop that process group. This example assumes the repository's
existing `npm run dev` command accepts `PORT`. Check that assumption first:
some tools require an explicit `--port` option instead.

```json
{
  "version": 1,
  "app": "web-checks",
  "launch": {
    "mode": "owned",
    "command": ["npm", "run", "dev"],
    "env": { "PORT": "${port}" },
    "ready": {
      "url": "http://127.0.0.1:${port}/health",
      "status": 200,
      "timeoutMs": 120000
    }
  },
  "api": "http://127.0.0.1:${port}",
  "checks": {}
}
```

Replace `/health` with a real readiness endpoint. Declare `web` with the same
origin only when you need browser checks; it makes `agent-browser` a required
tool at `up`. For browser work, install the pinned tool and its Chromium as
shown in [support](support.md). Add only the exact extra origins that the
journey needs. Do not use a person's browser session.

For an HTTP claim, use this plan instead of the suite plan:

```json
{
  "claims": [
    {
      "id": "health-ready",
      "behavior": "The app reports ready.",
      "entryPoint": "GET /health",
      "precondition": "The isolated app is running.",
      "expected": "HTTP 200 with JSON status ok.",
      "case": "Healthy and deliberately unhealthy target.",
      "checks": ["api GET /health"],
      "evidence": ["Retained response and JSON assertion"],
      "kind": "behavior"
    }
  ],
  "controls": [
    {
      "id": "detects-unhealthy",
      "claim": "health-ready",
      "expectation": "The status assertion detects the deliberately unhealthy app.",
      "assertion": "json status=ok"
    }
  ],
  "gates": [],
  "limits": ["No visual layout, sign-in or persistent data claim."]
}
```

Adapt the endpoint and JSON assertion to the real app. For the fault run:

```sh
spyglass up --run adoption-fault --plan verification-plan.json --json
spyglass api GET /health --expect 200 --expect-json status=ok \
  --control detects-unhealthy:failed --run adoption-fault --json
spyglass down --run adoption-fault --json
```

The command must fail the declared assertion, not another assertion. Restore
the target through its supported fault facility, or use a candidate worktree
as described below. On the candidate:

```sh
spyglass up --run adoption-pass --plan verification-plan.json --json
spyglass api GET /health --expect 200 --expect-json status=ok \
  --claim health-ready --control detects-unhealthy:restored --run adoption-pass --json
spyglass result set --control detects-unhealthy --failed-run adoption-fault \
  --failed-step FAILED_STEP_ID --observed-failure "State the failed status assertion." \
  --observed-pass "State the restored response." --run adoption-pass
spyglass result set --claim health-ready --outcome passed \
  --observed "State the actual HTTP status and JSON value." --run adoption-pass
```

A screenshot needs a separate visual claim and actual image inspection. A
write needs a side-effect claim and a later independent read. Neither is
proved by the health recipe. Complete the run with the shared commands below.

## Recipe 3: a repository-owned installation or library host

Do not replace an existing lifecycle tool with a generic dev server. Start an
isolated installation with that tool **before** `up`. Bind its non-secret ID,
not a shared production installation. Use the tool's real command syntax in
this complete profile template:

```json
{
  "version": 1,
  "app": "owner-journey",
  "launch": {
    "mode": "external",
    "doctor": ["./scripts/owner", "doctor", "${installation}"]
  },
  "checks": {
    "verify": {
      "command": ["./scripts/owner", "verify", "${installation}"],
      "timeoutMs": 300000,
      "result": "json"
    },
    "cleanup": {
      "command": ["./scripts/owner", "down", "${installation}"],
      "cleanup": true
    }
  }
}
```

`./scripts/owner` is a placeholder for an existing repository tool, not a
Spyglass executable to create. Use `result: "exit"` if that tool does not emit
supported structured assertions, and state the coverage limit. A library host
needs no `web` or `api`. Add those only if the journey uses them. Use secret
references for database connections or seats, never binding values.

The names `repo`, `run`, `port`, `web`, `api` and `evidence` are reserved run
values. `up` rejects a profile or CLI binding with one of these names before
allocating a run. For a repository-owned port use `ownerPort` and
`http://127.0.0.1:${ownerPort}`; `${port}` is allocated by Spyglass, not the owner.

Reuse recipe 1's claim/control plan, with the real entry point and failure
message. Start both fault and candidate runs with the owner installation ID:

```sh
spyglass up --run adoption-pass --plan verification-plan.json \
  --binding installation=ISOLATED_OWNER_ID --json
spyglass check verify --claim existing-check --control detects-fault:restored \
  --run adoption-pass --json
```

Retain the owner's source/build identity with its check evidence. Declare
ignored output locations under `imports` and `checks.verify.artifacts` if the
owner writes files. Do not substitute another installation for a failed one
inside a run. Finish with:

```sh
spyglass finish --cleanup cleanup --run adoption-pass --json
```

`down` alone does not prove external cleanup. If `finish` fails before the
cleanup stage and source is unchanged, use `spyglass check cleanup --run
adoption-pass`, then `down` to release resources. If source changed, `check`
also refuses to run: call the existing owner's teardown command directly with
the original isolated installation ID, then run `down` and `report`. Record
that teardown separately; the report remains incomplete because Spyglass did
not record a successful owner cleanup check. Preserve it and repair in a new
run. Shared services must remain running.

## Record the failure without changing an active run's source

Prefer an existing, safe runner fault facility that leaves source unchanged.
Keep the expectation fixed. For example, the observed Kleur adoption used its
existing color assertions and `NO_COLOR=1`, not a new test or a weaker
expectation. Its old `esm` runner needed Node 16.20.2; Spyglass stayed on Node 24. The profile called that isolated target runtime with the unchanged uvu
arguments, and set `FORCE_COLOR=1` for captured output. After configuring the
real check as `verify` and the command-form control as `detects-fault`:

```sh
spyglass up --run adoption-pass --plan verification-plan.json --json
NO_COLOR=1 spyglass check verify --control detects-fault:failed --run adoption-pass --json
# The preceding command must exit 1 on the declared color assertion.
env -u NO_COLOR -u NODE_DISABLE_COLORS spyglass check verify \
  --claim existing-check --control detects-fault:restored --run adoption-pass --json
spyglass result set --control detects-fault \
  --observed-failure "NO_COLOR disabled ANSI output; the existing color assertions failed." \
  --observed-pass "Removing NO_COLOR restored all existing assertions." --run adoption-pass
spyglass result set --claim existing-check --outcome passed \
  --observed "The existing runner passed all 15 checks with no skips." --run adoption-pass
spyglass finish --run adoption-pass --json
spyglass report --run adoption-pass --json
```

These observations apply only after the recorded outputs match them. The
fault mechanism is specific to Kleur; choose an existing safe facility for
other targets. An old target runtime is not a recommendation for production.

If the control requires a product-source change:

1. Prepare the profile, plan, dependencies and build on the candidate.
2. Create a separate Git worktree of the **same repository** for the fault.
   Copy the adoption profile, plan and evidence ignore rules if they are not
   committed; a new worktree does not inherit uncommitted setup. Install its
   dependencies with the repository's tools. Apply the smallest product fault
   there, then build it before `up`.
3. In the fault worktree, run `up --run adoption-fault --plan
verification-plan.json`, then `check verify --control detects-fault:failed
--run adoption-fault --json`. Keep the step ID. Confirm the intended
   assertion failed. Run owner cleanup if applicable, then `down` there.
4. In the candidate worktree, run `up --run adoption-pass --plan
verification-plan.json`, then `check verify --claim existing-check
--control detects-fault:restored --run adoption-pass --json`.
5. Link the fault, without copying or deleting its evidence:

```sh
spyglass result set --control detects-fault --failed-run adoption-fault \
  --failed-step FAILED_STEP_ID --observed-failure "Name the assertion and observed fault." \
  --observed-pass "Name the same assertion and restored result." --run adoption-pass
spyglass result set --claim existing-check --outcome passed \
  --observed "Describe the check output that supports this claim." --run adoption-pass
```

After the fault run's cleanup and `down`, run `report` for it too. Its report
can remain incomplete by design; keep that diagnostic report and failed step
rather than claiming the fault run passed. Keep the fault worktree until the
candidate's final report has been generated and retained.
Unrelated clones do not share a run store. Do not edit and restore source
inside an active run or remove the source check to make the control easier.

## Finish, reopen and retain

Write observations only after reading the evidence. Select `--operator human`
only for actual human operation; agents use `agent`.

```sh
spyglass result set --operator agent --run adoption-pass
spyglass status --work --run adoption-pass --json
spyglass result --check --run adoption-pass --json
spyglass finish --run adoption-pass --json
# For external mode use finish --cleanup cleanup instead.
```

Open the `reportPath` from the output. In a **new shell**, return to the target
repository and run:

```sh
spyglass status --run adoption-pass --json
spyglass report --run adoption-pass --json
```

The run must be stopped, and the report must still be complete without a live
app. Inspect both attempts, their source identities, the unchanged expectation,
limits and cleanup. Keep the self-contained HTML, summary and cited artifacts
in durable storage before deleting disposable worktrees. Local paths alone
are not retained proof. Do not distribute browser profiles or secret files.

`data.reviewPath` selects the generated Markdown review summary;
`data.report.review` records its artifact path and SHA-256. It remains
available when `report` exits 1 with incomplete proof. Read its findings and
limits, then inspect the detailed HTML and cited artifacts; the summary does
not replace them. For an upload recipe, source context and offline review,
see [review proof in GitHub Actions](ci.md).

If `finish` fails, it stops before later stages. Repair and retry when possible;
otherwise run the owner cleanup, `down` and `report` separately. A failed or
abandoned run still needs a retained diagnostic report. Cleanup errors remain
part of the outcome; do not change the verification failure to a pass.

Before moving proof out of a worktree, retain the producing scripts and a
checksum manifest with the report and artifacts. Test that the copied report
opens offline. Original machine paths are provenance, not portable commands.
Current CLI state can still point to the removed worktree; see
[known workflow limits](support.md#known-workflow-limits). Planned retained-folder
inspection is not available merely because an offline report was copied.

## Setup repairs

| Symptom                               | Repair                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCOVERY_INCOMPLETE`                | Read the discovery message. Supply a profile with a real named check and lifecycle mode; task-runner file presence does not prove a usable command.                                                                                                                                                       |
| `PROFILE_EXISTS`                      | Review the current profile. `init --force` replaces it, including manual edits; keep a copy first.                                                                                                                                                                                                        |
| `RESERVED_BINDING`                    | Rename the profile and CLI binding; use `ownerPort` for an external port instead of the run's allocated `${port}`.                                                                                                                                                                                        |
| Missing package manager or dependency | Use the repository's pinned tool and install instructions before `up`; do not silently switch lockfiles.                                                                                                                                                                                                  |
| Readiness timeout                     | Read retained launch output. Confirm bind address, port option, endpoint, expected status and build prerequisites. Keep the failed run, clean it up, and start a new run after profile/source repair.                                                                                                     |
| `STALE_SOURCE`                        | Preserve the attempt. Build before `up`; keep only generated evidence ignored. Start a new run on the final source.                                                                                                                                                                                       |
| Rejected control                      | Use `status --work` and `result --check`. Confirm the same assertion, or exact command and expected failure text, failed first and passed later. Link `failedRun` for a separate fault worktree.                                                                                                          |
| Incomplete owner cleanup              | If source is unchanged, run the profile check with `cleanup: true`, then `down` and `report`. If source changed, use the owner tool directly with the original isolated ID, then `down` and an incomplete `report`; retain separate cleanup evidence. Stopping Spyglass does not stop external resources. |

## Record an adoption attempt

Record the public target commit, candidate Spyglass commit and changes, tools,
commands, phase start/end times, first complete report time, setup repairs,
failed attempts, result rejections, assistance and evidence location. State
which instructions the operator saw. Separate deliberate controls from setup
failures. Record unavailable metrics as unavailable, not estimates.

Spyglass targets agent verification. Human trials are not planned or required
for adoption acceptance. Agent evidence does not establish human usability;
make no human-use claim from these records. See the
[M2 adoption record](adoption-m2.md) for observed outcomes and remaining limits.
