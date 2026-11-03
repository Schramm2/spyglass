# Claude Code Cloud task: prove the current Spyglass workflow

Run this task in a Claude Code cloud session in the public Spyglass
repository. Start from the pushed `docs/product-roadmap` branch, not from
`main` alone: that branch contains this prompt and `docs/roadmap.md`. Check
that both files exist before starting. Use the session's assigned task branch
with this prerequisite commit included. If branch restrictions prevent that,
report the exact blocker; do not reconstruct missing documents.

Complete M1.1 in `docs/roadmap.md` end to end where the cloud environment
permits. Do not implement later
milestones. The goal is an honest, repeatable current-version comparison,
not a claim that Spyglass must win.

## Read first

Read `AGENTS.md`, `GLOSSARY.md`, `docs/roadmap.md`, `ARCHITECTURE.md`,
`agent_docs/testing.md`, `agent_docs/delivery.md`, `docs/failure-cases.md`,
`docs/verification-speed.md`, `docs/browser-benchmark.md`,
`README.md` and the relevant skills in `skills/`.
Inspect `bench/`, `fixtures/demo-app/` and the existing E2E tests. Follow
repository instructions that are available in this checkout. Local private
plans and maintainer paths are not dependencies of this task.

Check the actual source and version; do not assume the version in this
prompt is current. Preserve unrelated changes. Use the branch assigned by
Claude Code with main as the PR target, or create a task branch from main
if the session has no assigned branch, and include the prerequisite commit
from `docs/product-roadmap` before work. Do not merge into main. Follow the
session's branch and network restrictions.

## 1. Preflight and fix the protocol

Check Node, Git, the pinned `agent-browser`, Chromium, available process and
network facilities, independent agent launch, model identity/settings, token
metrics and artifact retention. Record what is available and what is not.
Do not fetch credentials or request paid model access. Use an existing,
authorized agent facility if available; do not install a new harness or
create API credentials to manufacture independent operators. Claude Code
subagents count as fresh operators only if you can give each the frozen
brief without inherited coordinator context or access to other arm results.
Record their actual model and settings. Do not assume that a cloud session
supports independent operators, browser execution or durable artifacts.

Write `docs/operator-comparison.md` before scored runs. Define:

- A public browser/API journey based on the demo app and a command-only
  journey based on existing public fixtures or checks.
- Fixed tasks, claims, preconditions, expected outcomes, intended controls,
  independent reads, visual inspections and cleanup requirements.
- Direct-tool and Spyglass briefs with identical tasks and claim coverage;
  change only the tool instructions. No worked solution in the briefs.
- Three repetitions per journey with one fresh operator per arm per
  repetition: 12 independent operator runs in total. Keep model and settings
  equal, record the randomized order, isolate resources and prevent access
  to the other arm's results. Freeze briefs before scored runs.
- A direct-tool evidence contract equivalent to Spyglass: action and result
  records, source identity, retained failures, control failure and restored
  pass, independent reads, images and actual inspection where applicable,
  cleanup and an offline record. Direct scripts are allowed and counted.
- Exact definitions for operator tool calls, shell invocations, phase time,
  tokens, driver code written, unplanned failures, deliberate controls,
  result rejections, coordinator help and human help.
- Invalid-comparison rules, evidence retention, redaction and the procedure
  to repeat the study. Keep exploration and protocol repairs separate from
  scored runs. After a protocol change, repeat affected scored runs.

Use the fewest concurrent operators needed for isolation and available
resources. Do not run both arms yourself and label them independent. Do not
substitute the scripted benchmark for fresh-agent results.

## 2. Execute and retain evidence

Run the build and existing E2E checks. Run the existing scripted journey and
overhead gate against the current build. Use their documented options and
retain machine-readable results with the tested commit, tool versions,
environment and exact commands. Explain warm/cold conditions and cache
policy. Label scripted operator-step counts as scripted, not model tool calls.

Execute the paired study if the environment supplies the required independent
operators. Each operator must open screenshots before recording visual
observations. Keep the deliberate failing attempt and restored passing
attempt, then inspect retained reports after cleanup. Compare only equal
coverage. Report raw measurements and ranges, not a general statistical
speed claim from three repetitions. Record missing metrics as unavailable;
never estimate token counts.

Deliver only sanitized public evidence. Inspect tracked output for credentials,
private data and local machine paths, including paths embedded in JSON.
Use repository-relative evidence links in tracked docs. Explain how full
reports will survive the cloud session: use supported durable artifacts or
safe retained files. If durable delivery is unavailable, mark that completion
check blocked; an expiring sandbox path is not retained evidence.

## 3. Findings and completion

Add the comparison results to `docs/operator-comparison.md` and link safe raw
measurements and retained reports. Separate protocol checks, scripted
measurements and independent operator results. Identify the largest observed
source of unnecessary operator work and propose one bounded follow-up with
acceptance checks. Do not implement that follow-up in this task.

Update M1.1 status and evidence links in `docs/roadmap.md`. Link the new
comparison from `docs/verification-speed.md`, without changing historical
scripted measurements. Add a README link so the roadmap is discoverable if
one is not present. `docs/core-comparison.md` is not a public prerequisite:
do not read, create, reconstruct or publish it. Use only public evidence for
this study.

The task must not stop at a plan when execution is possible. If independent
agents, browser facilities, credentials or durable artifacts are unavailable,
complete every independent runnable deliverable. Record precisely which
checks remain blocked and the smallest next action needed to resume. Keep
M1.1 partial; do not report M1 or human usability as proved.

## Scope and safety

- Reuse current benchmark code and existing test files. Small benchmark
  changes and documentation/evidence files are in scope. Do not add test
  files, helpers or fixtures without separate approval.
- For a benchmark behavior change, document its failure modes and extend an
  existing E2E test before implementation where applicable. Do not add
  implementation-coupled tests or weaken assertions to obtain a pass.
- Do not change the CLI contract, schemas, production behavior, dependency
  set or source/evidence safety rules. Report a discovered product defect as
  a bounded follow-up, keeping its failed attempt.
- No private repositories, secrets, paid services, external messages, npm
  publication, releases, tags or merges. Do not remove `private`.
- Do not use raw direct-tool timing without equivalent evidence to claim
  equal-proof superiority. Do not invent observations, metrics or passes.

## Verification and handoff

Run `npm run build`, `npm test`, `npm run format:check`, the scripted journey
and the overhead gate. Run opt-in surface tests if their real dependencies
are available. Use `agent_docs/testing.md` for the exact commands. Before any
push, run the delivery secret scan. Record unavailable checks explicitly.
Review the intended diff and all new tracked evidence for private content.

Return a PR-ready change on the task branch. In the final handoff, list:
changed files; exact checks and outcomes; evidence paths and retention;
completed versus blocked M1.1 checks; the measured conclusion with limits;
and the recommended next task. Do not claim completion from document
structure checks alone. Do not publish or merge the change automatically.
