# M1.2: immediate API read comparison

## Protocol (freeze before operator launch)

Repeat Journey B from [M1.1](operator-comparison.md), sections 2.1 and 3,
with the same six claims, declared control and equal-proof contract. The
control must observe `pending` in a separate GET immediately after the POST,
then retain a later GET whose same `json status=complete` assertion passes.
A POST response is not the failing read. A modified fixture is not allowed.

Use three fresh pairs of operators, direct tools and the candidate Spyglass,
on the same machine. Use Pi with `openai/gpt-6.1-sol`, medium reasoning, for
all six operators. Disable context-file, skill and MCP discovery for both
arms; expose only read, bash, edit and write. The Spyglass skill is supplied
as a file in that arm's directory. Save each transcript in its own operator
session directory outside the target repository. This is a new comparison,
not a speed comparison with the
Claude cloud study: the harness, model and platform differ.

Prepare separate Git repositories under `/tmp/m12/<run-id>/repo`, each with
an unchanged copy of `fixtures/demo-app`, the Journey B plan, `GLOSSARY.md`,
and ignored evidence, credentials and generated check output. Give each run
its own port, state directory and browser session. Only Spyglass operators
receive the candidate profile and skill. Put a frozen CLI build under
`/tmp/m12/tools/`. No operator receives the coordinator's worked solution,
other runs' records or the repository's implementation instructions.

Run the pairs in repetition order 3, 1, 2. Launch direct first in repetition
3 and Spyglass first in repetitions 1 and 2. This order is fixed before the
runs; it is a fresh shuffled order, not a claim of statistical balance. Run
each pair together and wait for both before starting the next pair. Run no
benchmark or test suite during a pair. The shared host and process visibility
remain isolation limits; operators must not list unrelated processes or read
outside their assigned directory.

### Brief

Fill only RUN, RUN_ID, PORT and the arm's Tools paragraph:

```text
You are a fresh operator verifying a public demo app. Work only inside RUN.
Do not read, list or search outside RUN or inspect other operators. Do not
start agents. Nobody will supply help after launch. Read repo/GLOSSARY.md
before writing prose. Do not modify fixtures, plans or tracked source.

In every shell call that needs them, export PATH=RUN/bin:$PATH and
XDG_STATE_HOME=RUN/state, then set -a; . RUN/repo/secrets.env; set +a.
Work in RUN/repo. The app is node fixtures/demo-app/server.mjs. It reads PORT,
DEMO_PASSWORD and DEMO_TOKEN. GET /health is ready at HTTP 200. The demo user
is agent@example.test. Credentials are in secrets.env; keep their values out
of commands, reports and retained output.

Verify all six claims and the control in verification-plan.json. Retain each
action with its time, request or command, status, assertions and output;
source identity at start and end; all failed attempts; the immediate GET's
failed completion assertion and the later restored GET; a separate later
independent read and the question list; a 390x844 screenshot and an inspection
written only after opening the image with read; and cleanup evidence. Keep
one offline report with claims, control, source, limits and cleanup. Stop
the app and browser, then confirm they are stopped. Avoid unrelated process
listings. At the end, give the report path, each outcome and any gap.
```

Direct Tools paragraph:

```text
Tools: shell, Node 24, Git, curl and agent-browser 0.38.2 (use --help).
Use browser session RUN_ID and PORT=PORT. You may write driver scripts.
Retain all records and an offline Markdown or HTML report under repo/evidence.
Do not use Spyglass.
```

Spyglass Tools paragraph:

```text
Tools: the same tools plus candidate spyglass. Read RUN/skill/SKILL.md, then
spyglass --help and each command's --help before use. Use Spyglass for the
run, all driving steps, result and report, with run ID RUN_ID. The profile
starts the app. Complete this journey without helper scripts or custom checks.
The CLI and skill, not this brief, supply command syntax.
```

### Measurement and acceptance

Retain sanitized evidence under `bench/results/m1.2/`, with a per-run record,
source commit, tool versions, final answer and coordinator acceptance notes.
Operator transcripts stay outside Git because they include harness metadata.
Audit them for isolation, help, screenshot opening and measurements.

Count model tool calls (one shell tool call remains one call), shell calls,
wall time from the first operator message to the final answer, exposed usage,
written driver lines, failed attempts and result rejections. Record a metric
as unavailable when the harness does not expose it. Report raw values and
ranges only. Do not infer phase times from calls that combine phases.

After cleanup, independently check all six claims, the declared control,
source identity, artifact checksums where supplied, credential masking,
screenshot contents and cleanup. Keep an incomplete or unequal run, but do
not rank its pair. Do not repair an operator's evidence after the run. Record
all coordinator or human help; there is no planned help. A broken preparation
requires a recorded protocol repair and fresh affected operators.

Success for the repair: every Spyglass run meets the declared control on the
unchanged fixture without helper scripts, with coverage equal to its direct
pair. Three repetitions support no general speed claim. M1.1 overhead and
first-frame failures stay visible; this API change does not resolve them.

## Execution record

### Preparation repair 1 (unscored first pair)

The protocol and candidate were frozen at `b53a6cd`. The first repetition 3
pair exposed a coordinator preparation defect: the frozen `dist/` copy did
not include its external runtime dependencies. `spyglass --help` worked,
but `up` failed because `zod` was absent. The coordinator stopped both
operators and asked them to clean up; both attempts are unscored and retained
under `superseded/`. These two cleanup messages are interventions, not help
in a scored run.

Repair: copy the candidate's installed dependencies into the shared tools
directory and preflight `spyglass schema plan --json`. Repeat the entire
pair with fresh operators and new `-v2` directories before repetitions 1
and 2. The claims, control, brief, fixture and candidate source are unchanged.
No scored operator receives a message after launch. Earlier artifacts and
transcripts remain unchanged.

### Source and environment

- Candidate: `b53a6cd`; protocol repair record: `c5ea6c0`. The later commits
  add only results and documentation; the tested production code is unchanged.
- macOS arm64, Node v24.11.1, agent-browser 0.38.2, Pi 1.5.0,
  `openai/gpt-6.1-sol`, medium reasoning, for every scored operator.
- The repaired CLI copy included the installed runtime dependencies.
- Context-file, skill and MCP discovery were disabled for both arms. No
  operator received this repository's `AGENTS.md`. No scored operator received
  coordinator or human help, read another run's files, or listed unrelated
  processes. Tool implementations and browser sockets still share the host.
- The order was fixed manually before launch, not sampled from a retained
  random seed. The protocol's word “shuffled” describes that fixed
  permutation, not a randomized study. This is a study-design limit.

### Checks

| Check | Result |
| --- | --- |
| New E2E checks on the old CLI | Both failed because `--then` was unsupported. |
| Template safety cases before repair | Failed on dot-segment route selection; an independent CLI reproduction also showed malformed Unicode losing the write's structured result. |
| Focused checks after implementation and safety repair | 2 passed. |
| `npm run build` | Passed. |
| `npm test` | 87 passed, 25 opt-in tests skipped. |
| `npm run format:check` | Passed. |
| Opt-in surface suite | All 25 passed on rerun. The first attempt overlapped a rebuild and failed one API check because `dist/surfaces.js` was temporarily absent; the other 24 passed. The rerun used a stable build. |
| Independent code review | Two template-handling findings were repaired and rechecked; no blocking finding remained. |
| Secret scan | The evidence scan first flagged four copies of an upstream proxy example. Those example credentials were removed from the retained copies, with hashes recorded. The final evidence and branch scans passed. |
| `node bench/overhead.mjs --label m1.2-local` | Passed on a stable build: added p50 42.1–42.7 ms and p95 43.0–57.3 ms; cold-start p50 27.4 ms. The first attempt overlapped a rebuild and exited 2 before producing a result file. |

The 2026-11-03 cloud overhead gate and first-frame failure in M1.1 remain
historical failures. The local first-frame surface check passed; this does
not establish a cloud fix. The local overhead result is retained separately in
[`overhead-2026-11-03-m1.2-local.json`](../bench/results/overhead-2026-11-03-m1.2-local.json).
The scripted journey was not repeated for this API-only change; the affected
operator journey was.

### Scored operator results

All six scored runs met the same six claims and declared control. Each
Spyglass operator used one `--then GET` failing read on the unchanged fixture,
then a separate restored GET with the same `json status=complete` assertion.
No Spyglass operator wrote a helper script or custom check. A separate later
read and question list supplied the side-effect claim's proof.

| Run | Claims | Tool calls | Shell calls | Wall (s) | Output tokens | Written lines | Result rejections | Dry-run rejections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B-direct-r1 | 6 | 15 | 5 | 154.395 | 5235 | 114 | n/a | n/a |
| B-spyglass-r1 | 6 | 19 | 11 | 123.767 | 2790 | 0 | 0 | 1 |
| B-direct-r2 | 6 | 15 | 5 | 147.674 | 4782 | 90 | n/a | n/a |
| B-spyglass-r2 | 6 | 25 | 14 | 117.642 | 3313 | 0 | 0 | 1 |
| B-direct-r3-v2 | 6 | 20 | 8 | 219.970 | 5866 | 133 | n/a | n/a |
| B-spyglass-r3-v2 | 6 | 21 | 10 | 122.736 | 3218 | 0 | 1 | 1 |

Raw values: [`runs.json`](../bench/results/m1.2/runs.json). Per-run
`operator-measures.json` retains timestamps, exposed usage and tool-call
counts without transcript content. Wall time includes discovery, driving,
recording and cleanup; it is not just app interaction. Written lines count
Write/Edit content and lines after the first in multi-line shell calls,
including evidence prose. Spyglass operators used one-line CLI calls, so this
measure is zero for them; it does not mean they issued no commands. Phase
times are unavailable. Token fields are sums of Pi's exposed usage fields;
cached input is reported separately, not treated as new input.

Ranges, direct then Spyglass: 15–20 vs 19–25 tool calls; 147.674–219.970 vs
117.642–123.767 seconds; 4782–5866 vs 2790–3313 output tokens. The Spyglass
operator finished sooner in each pair, but used more tool calls in each pair.
These are observations from three pairs with a fixed order, not a general
speed claim or a causal estimate of improvement over M1.1.

### Acceptance, retention and limits

Each scored run has `acceptance.json`, the operator's final answer, its plan,
and the offline report with all evidence under
[`bench/results/m1.2/`](../bench/results/m1.2/). The two superseded attempts
remain under `superseded/`; their outcomes are not counted as passes.

After cleanup, the coordinator checked the six claims and the failing and
restored control from retained records, confirmed unchanged source and closed
app ports, and queried each exact browser session without launching it. Each
browser was inactive with no PID. All 63 recorded Spyglass artifact checksums
matched. No per-run password or token value appeared in retained evidence.
The coordinator opened all six 390x844 screenshots: each shows the heading,
question field and green button inside the width without clipping. Each
operator also opened its image before recording its inspection.

Three direct-arm files contain redacted host-specific browser socket paths:
two from scored repetition 2 and one from the superseded repetition 3.
Four captured upstream help files also omit a credential-shaped proxy
example that the secret scanner flagged. It was an upstream example, not a
study credential. `runs.json` records original and retained SHA-256 values
for all seven redacted files. The original private copies remain unchanged. No checksummed Spyglass artifact
was edited. Ten intended evidence log files are explicitly included despite
the repository's general `*.log` ignore rule; staged artifact checksums and
report links are checked before delivery. Disposable `/tmp/m12/` and `/private/tmp/m12/` paths remain in
evidence where they record source and artifact identity. Other host paths and
private data are excluded. Raw transcripts are not in Git.

Limits: one model, one shared host, fixed rather than randomized order, three
pairs, different platform and harness from M1.1, no phase-time split, and no
database or restart-durability proof. Failed-action counts are not directly
comparable across the direct operators' log formats; all failures remain in
their evidence. The listed `toolErrorResults` metric counts tool errors, not
every failed assertion inside a successful shell call.

### Outcome and next observed problem

**M1.2 is complete within this scope.** The immediate-read gap is repaired,
all three Spyglass operators met the original control without helper scripts,
and all six runs retained equal claim/control coverage after cleanup.

The next repeated source of work is browser evidence retention. All three
Spyglass operators first used successful browser actions or assertions without
an artifact, then received `MISSING_EVIDENCE` and `BEHAVIOR_EVIDENCE_MISSING`
for `signin-refused` and `error-page-errors`. They added proof artifacts and
passed validation. Proposed follow-up: make the browser command or its repair
guidance supply the required retained assertion evidence without repeating a
successful interaction. Add its failure case and extend the owning E2E check
before changing behavior. Do not relax the requirement for retained evidence.

M2 can now observe fresh adoption attempts; it should record whether this
same browser-evidence problem occurs outside the prepared fixture.
