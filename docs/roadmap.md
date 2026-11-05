# Product roadmap

This is the forward roadmap for Spyglass. It records priorities, not release
promises. A milestone is complete only when its completion checks have
retained evidence. Dates and version numbers are assigned at release time.

## Product direction

Help coding agents verify their changes with real tools, less repeated work
and retained proof. Another operator must be able to inspect that proof
without the original conversation or shell.

Spyglass is agent-first. Judge improvements by verification quality, operator
tool calls, setup repairs and time to equal proof. Keep coverage, controls,
source identity and cleanup intact when reducing work. Human trials are not
planned for the current milestones and are not a delivery requirement.
Readable reports remain useful for inspection, but human adoption is not the
current target.

Keep the boundary clear: Spyglass records and validates mechanical facts.
The operator selects coverage, judges behavior and inspects images. More
commands, faster calls or more artifacts do not by themselves mean better
verification.

## Starting point

The documented release is 1.3.1. The core run, claim, source identity,
evidence, cleanup and offline report contracts are built. Browser, HTTP,
PostgreSQL, Compose and repository checks are supported. The workflow now
includes live claim linking, bounded expectations and polling, `ui verify`,
parallel checks, `replay` and `finish`.

Orders 0–7 of [verification speed](verification-speed.md) shipped in 1.3.0.
The scripted 12-claim journey reduced operator steps from 36 to 13, and wall
time from 10.9 to 9.0 seconds on the recorded machine. The overhead gate
passed, so a local server was not built.

These measurements do not prove the same improvement for an agent. M1.1
added the first retained independent operator comparison for the current
release: see [operator comparison](operator-comparison.md).

The [sustained-use review](usage-review.md), recorded on 5 November 2026,
adds maintainer-reported observations from 160 retained private-workspace
runs and 2,838 steps. It establishes sustained use, not a general speed,
human-usability or market-demand claim. Raw evidence stays private; the
public summary states its method and limits. Browser proof failures, late
control rejection and retention work justify hardening the current workflow
before expanding surfaces. M1–M3 remain done within their recorded scope;
this review does not resolve their historical limits or release the
unreleased improvements.

## Priority order

| Priority | Milestone                             | Status                   | Depends on                                      |
| -------- | ------------------------------------- | ------------------------ | ----------------------------------------------- |
| Done     | M1. Prove the current workflow        | Done, with limits        | Current CLI and public fixtures                 |
| Done     | M2. Reduce first-adoption work        | Done, with limits        | M1 findings; fresh adoption attempts            |
| Done     | M3. Support review and CI             | Done, with limits        | M1; a repeatable adoption recipe                |
| Next     | M3.1. Harden the current workflow     | Planned; not implemented | Sustained-use findings and public failure cases |
| Later    | M4. Expand from repeated adapter gaps | Demand-led               | M3.1 and repeated adoption need                 |
| Later    | M5. Evaluate shared evidence services | Not committed            | Remaining team needs after M3.1                 |

Independent discovery can overlap. Do not use this order to delay a safety
fix. Record scope changes and their reasons here.

## M1. Prove the current workflow

**Question:** Does current Spyglass reduce operator work at equal proof?

### M1.1 — a public, cloud-runnable comparison

Prepare and execute a comparison that uses only this repository's public
fixtures. Start with the browser/API journey and a command-only journey.
Reuse existing checks and benchmark code. Do not use private pilot
repositories, credentials or services.

Deliver:

- `docs/operator-comparison.md`: fixed tasks and claims, arm instructions,
  environment requirements, measurement definitions and execution procedure.
- A comparison record with source commits, tool versions, commands, measured
  results, evidence locations, failures and limits. Commit only sanitized
  public data. Identify ephemeral evidence that will not survive the cloud
  session; a path alone is not retained proof.
- Updated roadmap status and links. Preserve historical measurements.

The two arms use direct tools and current Spyglass. Both must keep equivalent
proof: actions, assertions, source identity, failed attempts, controls,
independent reads where required, image inspection and cleanup. Direct tools
may use scripts but must retain the required record too. A raw tool-floor
benchmark without evidence is not an equal-proof comparison.

Use fresh operators, the same model and settings, random arm order, isolated
targets and three repetitions per journey. Give both arms the same task and
claims; change only the tool instructions. Fix the protocol before scored
runs. Keep the coordinator's worked solution out of operator briefs. Record
all assistance. Never use the coordinator as both independent operators.

Measure verified claims per operator tool call, total tool calls, shell
invocations, phase wall time, tokens when exposed by the harness, driver code
written, failed attempts, result rejections and interventions. A tool call
that contains several shell commands still counts as one operator tool call.
Separate deliberate negative controls from unplanned failures. Report raw
values and ranges; three repetitions do not establish a general speed claim.

Completion checks:

1. Both journeys have fixed acceptance conditions and equal-proof rules.
2. Public-fixture preflight, the current scripted journey and overhead gate
   have recorded outcomes. Scripted results are labelled separately.
3. Independent operator runs are complete, reports remain available after
   cleanup, and coverage differences are explicit. Do not rank unequal runs.
4. Results identify the largest observed source of unnecessary operator work
   and propose one bounded follow-up, or explain why no change is justified.
5. No missing metric is estimated. No agent-generated prose is counted as
   actual visual inspection without opening the image.

**Cloud boundary:** A cloud session might not have independent agent launch,
model access, browser support or durable artifact delivery. Check these first.
Complete the protocol and every runnable check without those facilities, then
record the exact blocked checks and the command or facility needed to resume.
M1.1 remains partial until the independent runs and retained evidence exist.
Do not replace them with scripted calls and call the study complete.

**M1.1 status: done, with limits.** The protocol, the 12 scored runs and
their evidence are in [operator comparison](operator-comparison.md) and
`bench/results/m1.1/`. Completion checks:

1. Done: both journeys have fixed acceptance and equal-proof rules
   (sections 2 and 3), frozen before scored runs, with one recorded
   repair and its repeated runs (section 9.1).
2. Done: preflight, the scripted journey and the overhead gate are recorded
   separately (section 10.1). The overhead gate failed in the cloud
   container, and one opt-in surface test failed there.
3. Done: 12 independent runs with retained reports after cleanup. Nine
   runs met full journey acceptance. Journey C pairs are comparable.
   The three Spyglass Journey B runs did not meet the declared control;
   those pairs verified the same claims but are not ranked.
4. Done: the largest source of unnecessary work is an immediate
   read-after-write assertion in `spyglass api`; one bounded follow-up is
   proposed (section 10.6).
5. Done: phase time is recorded as unavailable; every visual inspection
   followed an opened image, and the coordinator opened all six.

Limits: operators were subagents of the same model in one shared container
(process lists were visible across runs) and with this repository's
`AGENTS.md` in context; three repetitions support no
general speed claim.

The [Claude Code Cloud task prompt](prompts/current-version-comparison.md) defines
the scope and execution boundaries for this task.

### M1.2 — repair measured friction

Select the highest-value bounded improvement from M1.1. Write its failure
case and extend an existing E2E test before implementation. Repeat affected
comparisons on the delivered source. Keep coverage and safety unchanged.
If a new test file is necessary, obtain approval first.

**M1.2 status: done, with limits.** One API write can now make an immediate
follow-up GET, retaining both requests and distinct assertions in one step.
It cannot count as the side-effect claim's later independent read. The
failure case and existing E2E file were extended before implementation.
An independent review found two template safety defects; both were repaired
and rechecked. The full suite passed (87 checks), and all 25 opt-in surface
checks passed on a stable build.

The [M1.2 comparison](operator-comparison-m1.2.md) retains three fresh
browser/API pairs. All six runs met the six claims and the original control;
every Spyglass operator used the immediate GET without helper scripts or a
modified fixture. One broken preparation pair was superseded and retained.
This study used a fixed order, another model/harness and another platform
than M1.1; it supplies no general speed claim or cross-study speed estimate.
The M1.1 cloud overhead and first-frame failures remain open. A repeated
browser-evidence retention problem is recorded as a proposed follow-up.

**M1 completion:** evidence supports a bounded statement about current agent
work, and any selected repair has repeated proof. A target that is missed
remains visible; it is not a reason to weaken completion rules.

## M2. Reduce first-adoption work

Observe fresh agent operators in repositories outside the original pilots. Measure
time to the first useful report, setup repairs and undocumented help.

- Improve `init` and repair guidance from observed failures.
- Supply complete recipes for an existing test suite or CLI, a web app, and
  a repository-owned installation or library journey.
- Define tested platform and external-tool support.
- Evaluate versioned installation and upgrade paths. npm publication is a
  separate approval, not an action authorized by this roadmap.

**Completion:** a fresh agent operator installs Spyglass, adopts an existing
check, records an intended failure and restored pass, cleans up and reopens
the report without undocumented help. No human trial is required.

**M2 status: done, with limits for agent adoption.** The
[M2 adoption record](adoption-m2.md) retains baseline attempts in two public
repositories and a fresh delivered-candidate trial in a third. The fresh
operator installed the candidate, adopted an existing check, detected an
intended failure, restored the same expectations, cleaned up and reopened the
complete report without undocumented product help. Human use remains untested
and is outside this milestone's delivery scope.

The [adoption recipes](adoption.md) cover existing checks, an isolated web app
and a repository-owned installation or library host. The
[support guide](support.md) states tested configurations and unverified
platforms. Observed failures led to first-run `init` guidance, early reserved
binding rejection, and built local archives with a public-file allowlist.
Pinned source and isolated-prefix upgrade/rollback paths were evaluated;
npm publication remains disabled. The stable build passed 89 core and 25
real-surface E2E checks. Evidence, assistance and timing limits are explicit
in the record. This is not a general speed or human-usability claim.

## M3. Support review and CI

Begin with a GitHub Actions recipe, not a hosted service. Keep reports on
success and failure, provide a compact claim/control/limit/cleanup summary,
and show how to download and open the offline report. Distinguish local proof
from CI proof and identify the tested candidate source.

Use reviewer feedback to improve the report. Evaluate source, attempt and
artifact navigation before adding a new dashboard.

**Completion:** a reviewer can identify the tested source, intended failure,
restored pass and remaining limits from retained evidence without the
original conversation. Verify the workflow on a real pull request.

**M3 status: done, with limits.** The [CI recipe](ci.md) implements public
complete and interrupted-run paths, retained offline reports and Markdown
review summaries, source context and required CI checks. Command-form controls
show their command and expected failure. The [M3 evidence record](review-m3.md)
retains real-PR artifacts and an artifact-only reviewer outcome: source,
failure/restoration, cleanup and limits were traceable offline, all 13 artifact
checksums matched across 77 references, and all reviewer-led presentation
repairs passed recheck. Closing run 41867158951 passed the required workflow
gate and both E2E jobs after the existing navigation test awaited completion.
The previous failure remains retained. Report acceptance does not override
failed or pending repository checks. Scope is the public recipe and recorded
sources, not arbitrary adoption, general speed or human usability.

## M3.1. Harden the current workflow

**Question:** Can an operator obtain the same proof with fewer failed captures,
late validation repairs and manual retention steps?

**Status: planned; no slice is complete.** The [sustained-use review](usage-review.md)
owns the sanitized findings and their acceptance checks. Its private usage
counts are not public regression proof. Reproduce each selected failure with
public fixtures before changing behavior; use existing E2E files first.

Deliver these slices in order. Independent safety repairs can proceed earlier.
Interface and file-format choices remain design work, not promised commands.

### Slice 1 — reliable browser proof

Cover [R1](usage-review.md#r1-reliable-browser-proof): sheet and development-preview
capture failures, useful stage diagnostics, retained partial evidence, and
bounded capture and failure recovery. Keep origin and browser ownership
boundaries. Do not infer visual success from DOM evidence.

**Completion:** a public real-browser reproduction fails first, then passes
with inspectable images. A forced capture timeout retains earlier diagnostics,
names the stalled stage and leaves the claim incomplete. Retain the report
after cleanup. A private-target repeat, when available and authorized, stays
separate from public proof; an unrun repeat remains a stated limit.

### Slice 2 — early validation and safe completion

Cover [R2](usage-review.md#r2-validate-control-modes-before-starting-work),
[R5](usage-review.md#r5-finish-failed-and-abandoned-runs-with-a-report) and
[R8](usage-review.md#r8-safe-interruption-recovery): reject invalid control
modes before allocation, simplify cleanup and reporting for failed runs,
and recover interrupted work only when ownership is proved.

**Completion:** invalid plans start no resources; valid controls complete;
failed and abandoned runs retain their failure, cleanup outcome and diagnostic
report. Interruption checks refuse live locks, reused PIDs and uncertain
ownership. Do not silently change the existing `finish` contract or turn a
failed verification into a pass.

### Slice 3 — portable, compact proof

Cover [R3](usage-review.md#r3-inspect-proof-after-worktree-removal) and
[R6](usage-review.md#r6-retain-the-source-baseline-without-repeating-its-full-file-map):
inspect retained evidence without its original worktree or run store, make
evidence availability explicit, and reduce repeated source manifests without
losing identity or historical compatibility.

**Completion:** after removing a disposable worktree, a fresh environment can
inspect moved complete and failed proof with validated artifacts, controls,
source and cleanup. A long public journey produces materially smaller records
at equal proof. Changed bytes still fail; old evidence remains readable.
Retain the before/after artifact and record any compatibility boundary.

### Slice 4 — adoption and repository completion

Cover [R4](usage-review.md#r4-keep-claim-scope-and-completion-scope-distinct),
[R7](usage-review.md#r7-bring-adoption-recipes-up-to-the-delivered-workflow) and
[R9](usage-review.md#r9-connect-owner-gate-evidence-without-duplicate-execution):
align recipes with the tested build, classify state observations and side
effects correctly, distinguish parser controls from product-fault controls,
and connect valid owner proof without duplicate execution. Recheck old gate
citation findings against current code before selecting a repair.

**Completion:** a fresh operator completes a fixed adoption journey without
undocumented help. A GET alone cannot prove a write; supported owner action/read
records keep their real assertions. Required gates, review and limits remain
visible in repository completion, separate from a scoped run verdict. Retain
calls, repairs and evidence before stating an improvement.

**M3.1 completion:** all four slices meet their checks on identified candidate
source, with failure-first public E2E evidence, retained reports and remaining
limits. No public claim depends on access to private data. Keep historical
comparison results unchanged; new measurements must name their own sources,
method and limits. No version or release is assigned by this milestone.

## M4. Expand from repeated adapter gaps

Prefer named checks and imported evidence from existing tools. Candidate
areas include runner result imports, reusable browser journeys, specialist
diagnostics and repository-owned desktop, mobile or TUI checks. These are
options, not promised native drivers.

Select one gap only after recording repeated adoption need. First distinguish
an unreliable existing adapter from a genuinely missing capability; M3.1
repairs the current workflow before expansion. Define the selected gap's
ownership, isolation, credential and artifact boundaries before building.

**Completion per expansion:** demonstrate a real journey in more than one
repository, an intended failure, restored pass, final source identity and
cleanup. Preserve existing runner assertions and limits.

## M5. Evaluate shared evidence services

After M3.1, investigate cross-machine sharing, retention, access control, run
comparison and team review needs. First evaluate the portable offline proof
from M3.1 and simpler artifact storage. Moved-worktree evidence alone does not
justify a service. Choose an implementation or business model only after
recording a remaining need.

**Decision check:** documented user need, data/security boundaries, operating
cost and an explicit go/no-go decision. Keep offline reports supported.

## Not planned now

- `spyglass serve`: reconsider only if measurements miss the overhead gate.
- Universal native desktop, mobile or TUI control without demonstrated need.
- Automatic semantic verdicts or fabricated visual observations.
- More low-level commands when a bounded claim-level operation is sufficient.
- A hosted dashboard before evidence of a review or sharing problem.

## Roadmap maintenance

Update status, evidence links and unresolved limits in the same change that
completes work. Keep historical comparison data unchanged; add resolution
notes and links instead of rewriting old results. Update this roadmap's
starting point when releases change it. CLI contract changes must also follow
[delivery](../agent_docs/delivery.md).
