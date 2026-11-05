# M2 adoption record

This record covers first adoption by agents, not observed human use. The
[adoption recipes](adoption.md) and [support boundaries](support.md) are the
operator instructions. No npm publication, release tag or global installation
was performed.

## Protocol and scope

Two fresh agents first attempted adoption in public repositories outside the
original pilots. The coordinator supplied a task, suggested public targets,
installation boundaries and completion checks, but no worked profile or plan.
Operators could use public docs, command help, schemas and target source.
They recorded setup failures and repairs. A third fresh operator then used
the delivered adoption recipes and candidate in another public repository.

All three used Pi with GPT-6.1 Sol, medium reasoning, on the same macOS arm64
host (macOS 27.0.1, Node 24.11.1, npm 11.6.2, Git 2.56.0). These are separate
agent contexts, not independent humans or a blinded controlled comparison.
They could see other terminals; shared source was read-only for operators.
Do not infer a general speed improvement from these trials.

A first useful report means a complete report after cleanup with the selected
claim, intended failure, restored pass, source identity, limits and retained
proof. Initial instruction reading was not timed in the Kleur trial. Missing
metrics are unavailable, not estimated. Setup repairs are not counted as
intended controls.

## Baseline library adoption: Kleur

- Target: public [lukeed/kleur](https://github.com/lukeed/kleur), commit
  `fa3454483899ddab550d08c18c028e6db1aab0e5`, version 4.1.5.
- Spyglass: source commit `e8bf2130637c3bc2284b89986a862abfe6f198e9`, installed
  from a local archive into an isolated prefix; reported version 1.3.1.
- Archive SHA-256:
  `2fd60ea57c6e96a50cd2988c144c5edb42913e73ad04e6cef816ad65307b8d1f`.
  This was an existing build, not a verified clean rebuild of that commit.
  It is baseline workflow evidence, not acceptance of the final M2 runtime.
- Retained selected evidence: [`library/`](../bench/results/m2/library/).
  The original archive is **not** distributed: it included private local
  plans. The retained report and cited artifact bytes were copied unchanged.

`init` found the existing test. `npm test` failed because its `esm` runner did
not work on Node 24. An attempted Node 14 installation failed on arm64. A
separate Node 16.20.2 runtime then ran the same uvu arguments; Spyglass stayed
on Node 24. No target production or test source was changed.

The real `NO_COLOR=1` control failed 12 of 15 existing assertions. Removing
that environment value restored all 15, with no skips. The same command and
expectations supplied the claim, control and gate. `result --check` and
`finish` passed. A new shell reopened the stopped run and read the complete
offline report from disk.

| Event                                             | UTC, 2026-11-04 | Seconds from recorded start |
| ------------------------------------------------- | --------------- | --------------------------: |
| Recorded start, after initial instruction reading | 13:38:34        |                           0 |
| Isolated Spyglass installation complete           | 13:38:57        |                          23 |
| Setup complete                                    | 13:41:01        |                         147 |
| First complete report                             | 13:41:27        |                         173 |
| New-shell report read complete                    | 13:42:01        |                         207 |

No undocumented Spyglass flag, source-code inspection or coordinator product
help was needed. The agent read schema/help output, the control reference and
target CI to resolve the runtime mismatch. Time spent on those reads is part
of setup after the recorded start. The recipe now explains separate target
runtimes and this same-source environment control.

## Web and external lifecycle adoption: Polka

The fresh agent selected public [lukeed/polka](https://github.com/lukeed/polka),
commit `c36cf8b5d1a57164e64fdd7d4e0d0f80ab262dc0`, and its existing Sirv and
Morgan examples. The final baseline-copy run passed two behavior claims, its
wrong-owner control, all 343 repository assertions, owner cleanup and a
new-shell report read. Its first complete report was generated at
13:48:01.193 UTC; the final portable-evidence report was complete at
13:51:08.826. The final
successful new-shell read was at 13:52:52, 14 minutes 47 seconds from the
agent session start at 13:38:05. These clock boundaries differ from Kleur's
post-instruction clock; do not rank them.

Selected evidence and the detailed failure/repair record are retained under
[`web/`](../bench/results/m2/web/), including byte-exact run artifacts and
command excerpts. The attempt exposed these adoption problems:

1. Root discovery found a test script, not an example server. The profile
   needed explicit owner setup.
2. A profile binding named `port` was silently replaced by Spyglass's allocated
   port. The failed run and diagnostic report were kept. The operator repaired
   it with `ownerPort`. The delivered CLI now refuses the conflict before
   allocation with `RESERVED_BINDING`.
3. The repository bootstrap needed Yarn. The operator installed it in a local
   prefix rather than changing the repository's lifecycle tool.
4. An existing assertion depended on old Node error-message wording. Its
   compatibility repair and original failure remain separate from the
   web control; they do not prove a product-source mutation control.
5. The first attempted copied-source rebuild lacked `package-lock.json` and
   failed. Earlier runs used existing build output. They are not clean-build
   acceptance. The final retained rerun used a verified build of the initial
   source copy. Its archive and CLI bytes matched the original archive: file
   timestamps alone had not proved that the original build was stale. This
   remains baseline-copy evidence, not acceptance of the M2 runtime.

The web control uses two existing examples at one isolated origin: Morgan
fails the unchanged `/health` expectation, then Sirv restores it. This checks
wrong-target detection, not a product-source mutation. The browser checks only
the local page title and element count, plus the stylesheet response; external
images, gallery visibility and visual appearance are not claimed.

The coordinator requested a separate final rerun with a portable temporary
`PATH`, so byte-exact evidence would contain no personal source-checkout path.
This is recorded assistance for public retention, not an unaided trial.
The run keeps start/stop authority with the external `npm start` owner and
records its cleanup check; it does not demonstrate every repository-owned
installation tool.

## Delivered candidate adoption

A third fresh operator used public
[juliangruber/isarray](https://github.com/juliangruber/isarray), commit
`8c8dd70d48ad5d0897733ca6726302a54ca9e177` (2.0.5), and the delivered recipes.
It selected the existing `npm run tests-only` command before `up`, without
changing test assertions, scripts or lockfiles. Lint and the network-backed
posttest audit are explicit limits, not claimed gates.

The same-repository fault worktree changed only the product export to return
false. Four of the existing 28 Tape assertions failed with the declared
`not ok 1 should be truthy` message. The unchanged candidate then passed all
28 assertions with the same check and plan, with no skips. `result --check`
passed on its first call; `finish` completed cleanup and a complete report.
A new shell reopened it while both runs were stopped. No undocumented product
help, product setup repair or result rejection was needed. One later status
call from the wrong directory failed; the operator retained it and used the
documented worktree location.

The measured clock started at 13:49:00 UTC after initial instruction reads.
The first useful complete report was generated at 13:53:32.483: **272.483
seconds**, including setup, packaging coordination and a duplicate pack.
The new-shell status/report calls passed at 13:53:51. Initial reading duration
and full request-to-report time are unavailable. Phase clock sources are
explicit in [`timing.json`](../bench/results/m2/final-adoption/timing.json).

The source commit was `e8bf2130637c3bc2284b89986a862abfe6f198e9` plus the M2
changes. The installed archive SHA-256 was
`edcd81f9f34bda4811b885ad96e26d82769cf4b0b2bd53f3290313de979ff784`;
its CLI SHA-256 was
`78b68c380450109398d67bb67a154cf7754843178e4cc18e3356c6de2b8524ac`.
The installed dist manifest and source/patch identities are retained in
[`final-adoption/`](../bench/results/m2/final-adoption/). The CLI still reports
1.3.1; this is an unreleased candidate, not a new release. Concurrent edits
to the static manual changed the tracked patch but no runtime inputs.

The only lead assistance during the fresh trial was build coordination:
checkout packaging waited until suites stopped reading `dist`. A temporary
source-copy package and the later checkout package were byte-identical; all
adoption runs used the checkout-prefix installation.

The fresh trial found that the archive omitted the new public guides. The
package-content E2E then failed on the missing guide before the allowlist was
extended to include exactly `docs/adoption.md` and `docs/support.md`. The
complete source remains excluded. The guided packaging retest installed the
updated archive in another prefix, confirmed that both guides were present,
and found the complete runtime manifest and all three schemas unchanged.
Its archive SHA-256 was
`e4529247174b5537cbb12160ba3201759f11a6a42a611c72cdbbdb7bf4569fb2`.
New fault and candidate runs repeated the same 4/28 failing and 28/28 passing
assertions, completed cleanup and reopened a complete report in a new shell.
This is a **guided retest**, not another fresh trial. Its proof is retained
under [`guided-packaging/`](../bench/results/m2/guided-packaging/).

## Implemented repairs and proof

- `init` now gives guessed-field review, dependency/build prerequisites,
  planned-run and discovered-check commands, result observations, cleanup and
  report reopening. It still selects no acceptance conditions or verdict.
- `up` rejects reserved profile or CLI bindings before allocation or owner
  readiness. External ports use their own binding name.
- `npm pack` builds before packaging, and an explicit file allowlist excludes
  local plans, evidence and unrelated files. `private: true` remains.
- Complete recipes cover `none`, `owned` and `external`, including controls,
  source changes, owner cleanup failure and new-shell report reads.
- Support guidance separates requirements from observed configurations and
  unverified platforms. Installation guidance evaluates isolated archives,
  pinned source checkouts, upgrades and rollback without promising migration.

Failure-first records and final check output are in
[`checks/`](../bench/results/m2/checks/). The package-content check failed on
unapproved files before the allowlist. The `init` guidance check failed because
`setup` was absent. The reserved-binding check showed owner readiness executed
before rejection; after the repair it returns status 2 before a run exists.

The final stable build passed 89 core E2E checks and all 25 real-surface checks
(Chromium, HTTP, PostgreSQL and Compose), with no skips. The static manual's
new copy was checked at 1280x800 and 390x844: no document-width overflow, and
the new `init` guidance was readable in opened screenshots. Search matched
`RESERVED_BINDING`, showed a no-match state and cleared with Escape. One
initial text lookup did not match the combined `Local npm pack` phrase;
subsequent DOM reads and screenshots verified the actual copy. This was a
manual verification lookup failure, not a product check failure.

An independent read-only review found two recipe defects: stale-source
`check cleanup` cannot run, and a fault worktree does not inherit uncommitted
ignore rules. Both instructions were repaired and re-reviewed. The reserved
binding guard had no additional correctness finding in that review.

## Retained evidence checks

The coordinator independently checked all **50 produced-artifact references**
from the six retained run logs against the copied bytes. See
[`evidence-audit.json`](../bench/results/m2/evidence-audit.json) and the
[evidence index](../bench/results/m2/README.md). No cited artifact was edited.
Only retention metadata was regenerated after adding complete logs and
results; its indexes exclude themselves.

The guided report also opened in a real browser directly from a local file,
with no network request or page error. Its opened screenshot shows the passed
claim and candidate source identity. This checks offline rendering, not human
usability or the uncovered target behaviors.

## Installation decision

Keep pinned source checkouts as the release installation path and locally
built archives as the isolated candidate path. Use a second prefix to evaluate
an upgrade; retain the first for rollback. Do not add a self-updater or publish
to npm for M2.

[`install-selection.json`](../bench/results/m2/install-selection.json) records
a baseline → candidate → baseline `PATH` switch. All three public schema
reads passed and the CLI hashes identified the selected builds. Both report
1.3.1, so this tests prefix selection and rollback, not a released-version
upgrade or active-run migration. No schema migration promise is made.

## Completion

M2 is complete for the recorded **agent adoption** scope, with limits. A fresh
operator installed the candidate, adopted an existing check, recorded its
intended failure and restored pass, cleaned up and reopened the report using
the documented workflow and no undocumented product help. Baseline library
and web attempts supplied the repair evidence; the final trial used another
public repository. Human use is untested and is not included in this verdict.

**Delivery scope decision:** Spyglass targets more effective and efficient
agent verification. Human trials are not planned and are not a requirement
for M2 delivery or the current milestones. This decision does not change the
recorded observations or turn agent evidence into a human-use claim.

## Limits and follow-up

- Human use is **untested**. No agent run is described as a human trial.
- Windows, other architectures and other runtime/tool versions remain
  unverified. Existing historical cloud timing failures remain open.
- No upgrade migration or cross-version active-run compatibility is claimed.
- Public target dependency audit findings are not repaired by this work.
- Raw operator logs and baseline archives stay local. Only selected public
  evidence is retained; personal source paths in check diagnostics are replaced
  with `[SPYGLASS_SOURCE]`. No cited run artifact is rewritten. Local
  private-plan file names in package diagnostics are also replaced. Packaging
  retest logs and the aggregate checksum audit record those boundaries.
- A design problem remains outside this milestone: source drift blocks a
  named owner cleanup check, even when `cleanup: true`. The documented recovery
  uses the owner directly and keeps the report incomplete. A bounded follow-up
  should define a cleanup-only path based on the run's frozen ownership record,
  with wrong-worktree, wrong-resource and changed-source E2E failure cases.
  Do not bypass the general source check as an incidental repair.
- Two further design findings are outside the changed surfaces: `NOT_REPOSITORY`
  suggests `git init` when an existing clone needs `cd`; the report's
  command-form control has an empty Assertion label. Follow-ups should improve
  wrong-directory recovery and render the command, error code and expected
  failure text for command controls. Neither prevented the recorded trial.
- The target's case named `only polyfill` removes `Array.isArray` after loading
  its module. The retained check does not prove the fallback branch on this
  runtime. A target-owned follow-up should load it with the native function
  absent before import; no target assertion was weakened here.
