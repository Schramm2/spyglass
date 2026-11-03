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

Pending. The protocol must be committed before the first operator starts.
