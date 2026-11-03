# Product roadmap

This is the forward roadmap for Spyglass. It records priorities, not release
promises. A milestone is complete only when its completion checks have
retained evidence. Dates and version numbers are assigned at release time.

## Product direction

Help an agent or person verify a code change with less work, then let another
operator inspect the proof without the original conversation or shell.

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

These measurements do not prove the same improvement for an agent. This
public repository has no retained independent operator comparison for the
current release. M1.1 must supply that evidence before a comparison claim
can be made.

## Priority order

| Priority | Milestone                             | Status         | Depends on                           |
| -------- | ------------------------------------- | -------------- | ------------------------------------ |
| Now      | M1. Prove the current workflow        | Ready to start | Current CLI and public fixtures      |
| Next     | M2. Reduce first-adoption work        | Proposed       | M1 findings; fresh adoption attempts |
| Next     | M3. Support review and CI             | Proposed       | M1; a repeatable adoption recipe     |
| Later    | M4. Expand from repeated adapter gaps | Demand-led     | Evidence from adoption               |
| Later    | M5. Evaluate shared evidence services | Not committed  | Demonstrated team needs after M3     |

Independent discovery can overlap. Do not use this order to delay a safety
fix. Record scope changes and their reasons here.

## M1. Prove the current workflow

**Question:** Does current Spyglass reduce operator work at equal proof?

### M1.1 — next task: a public, cloud-runnable comparison

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

The [Claude Code Cloud task prompt](prompts/current-version-comparison.md) defines
the scope and execution boundaries for this task.

### M1.2 — repair measured friction

Select the highest-value bounded improvement from M1.1. Write its failure
case and extend an existing E2E test before implementation. Repeat affected
comparisons on the delivered source. Keep coverage and safety unchanged.
If a new test file is necessary, obtain approval first.

**M1 completion:** evidence supports a bounded statement about current agent
work, and any selected repair has repeated proof. A target that is missed
remains visible; it is not a reason to weaken completion rules.

## M2. Reduce first-adoption work

Observe fresh operators in repositories outside the original pilots. Measure
time to the first useful report, setup repairs and undocumented help.

- Improve `init` and repair guidance from observed failures.
- Supply complete recipes for an existing test suite or CLI, a web app, and
  a repository-owned installation or library journey.
- Define tested platform and external-tool support.
- Evaluate versioned installation and upgrade paths. npm publication is a
  separate approval, not an action authorized by this roadmap.

**Completion:** a fresh operator installs Spyglass, adopts an existing check,
records an intended failure and restored pass, cleans up and reopens the
report without undocumented help. Record observed human use separately from
agent use.

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

## M4. Expand from repeated adapter gaps

Prefer named checks and imported evidence from existing tools. Candidate
areas include runner result imports, reusable browser journeys, specialist
diagnostics and repository-owned desktop, mobile or TUI checks. These are
options, not promised native drivers.

Select one gap only after recording repeated adoption need. Define its
ownership, isolation, credential and artifact boundaries before building.

**Completion per expansion:** demonstrate a real journey in more than one
repository, an intended failure, restored pass, final source identity and
cleanup. Preserve existing runner assertions and limits.

## M5. Evaluate shared evidence services

After M3, investigate cross-machine sharing, retention, access control, run
comparison and team review needs. Compare a service with simpler artifact
storage before choosing an implementation or business model.

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
