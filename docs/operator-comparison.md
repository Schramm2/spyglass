# Operator comparison (M1.1)

This document fixes the protocol for M1.1 in the [product roadmap](roadmap.md):
a comparison of current Spyglass with direct tools at equal proof, run by
fresh operators on this repository's public fixtures. It also records the
results. Read `GLOSSARY.md` for the terms.

The question is whether current Spyglass reduces operator work at equal
proof. The study does not assume that it does. Three repetitions per journey
give raw values and ranges, not a general speed claim.

Sections 1 to 8 are the protocol. They were frozen in a commit before the
first scored run; a change to them after that commit is a protocol change
(section 8). Section 9 onward records execution and results.

## 1. Arms and operators

| Arm      | Tools the operator may use                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Direct   | Shell, Node 24, Git, `curl`, `agent-browser` 0.38.2, and any script the operator writes. No Spyglass.       |
| Spyglass | The same tools plus the `spyglass` CLI of the tested commit, its `--help`, and a copy of `skills/spyglass`. |

An **operator** is a fresh Claude Code subagent (`general-purpose` agent type)
started by the coordinator with only the frozen brief for its arm and
journey. A fresh subagent receives no coordinator conversation. Both arms use
the same model and settings, recorded in section 9. The coordinator never
operates a scored run.

Each operator works in its own **run directory** (`/tmp/m11/<run-id>/`) with
its own Git repository, port, browser session, `XDG_STATE_HOME` and evidence
folder. The brief forbids reading outside the run directory. The coordinator
checks each operator transcript for paths outside its run directory after
the run (section 7).

## 2. Journeys

Both journeys use only `fixtures/demo-app/`. The coordinator prepares each
run directory the same way for both arms (section 6); only the tool
instructions and, for the Spyglass arm, the profile differ.

### 2.1 Journey B: browser and API

Preconditions: the demo app is not running at the start. The demo user is
`agent@example.test`; its password is in `secrets.env` as `DEMO_PASSWORD`
and the API bearer token as `DEMO_TOKEN`. The app starts with
`node fixtures/demo-app/server.mjs` and reads `PORT`, `DEMO_PASSWORD` and
`DEMO_TOKEN`; `GET /health` returns 200 when it is ready.

| Claim                | Kind        | Behavior and expected result                                                                                                                                    |
| -------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signin-refused`     | behavior    | In the browser, a wrong password on `/login` is refused. The page shows `Sign in failed`.                                                                       |
| `login-dashboard`    | behavior    | In the browser, the demo user signs in with the correct password. The browser reaches `/dashboard` and the heading reads `Ask a question`.                      |
| `dashboard-mobile`   | visual      | At a 390x844 viewport the signed-in dashboard shows the heading, the question field and the `Submit question` button, readable and without horizontal clipping. |
| `question-accepted`  | behavior    | `POST /api/questions` with a bearer token and a non-empty question returns HTTP 202 with `status: "pending"` and an `id`.                                       |
| `question-completed` | side-effect | A later, separate read (`GET /api/questions/<id>`) shows `status: "complete"` with an answer, and `GET /api/questions` lists the question.                      |
| `error-page-errors`  | behavior    | In the browser, `/error` reports the console error `fixture console error` and the page error `fixture page error`, and the operator retains the error record.  |

Control `completion-detects-pending` for `question-completed`: the same
completion assertion (`status` equals `complete`), run on a read made
immediately after the POST, while the job is still pending, must fail. A
later read with the same assertion must pass. Keep both attempts.

### 2.2 Journey C: command only

Preconditions as in Journey B. No browser is used.

| Claim             | Kind     | Behavior and expected result                                                                                                                               |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health-ready`    | behavior | With the app running, `GET /health` returns HTTP 200 with `status: "ok"`.                                                                                  |
| `demo-check-pass` | behavior | `node fixtures/demo-app/check.mjs pass` exits 0 and its JSON output has `ok: true`, the assertion `demo-check` with `ok: true`, and an empty `skips` list. |

Control `demo-check-detects-failure` for `demo-check-pass`: the same
assertion (`demo-check`) run with `node fixtures/demo-app/check.mjs fail`
must fail; the later `pass` run must pass. Keep both attempts.

### 2.3 Acceptance conditions (both journeys)

A run is **accepted** when every claim of its journey passed, the control has
a retained failed attempt and a retained restored pass, and the evidence
contract below holds when the coordinator reads the evidence after cleanup.
A claim the coordinator cannot verify from retained evidence counts as not
verified, whatever the operator wrote.

## 3. Equal-proof evidence contract

Both arms must leave, in the run directory, evidence that a reviewer can read
offline after cleanup without the operator's conversation:

1. **Action records**: for each action, the command or request, the time,
   the exit status or HTTP status, and the output or a retained file with it.
2. **Assertions**: for each claim, what was expected and what was observed,
   tied to the action records that show it.
3. **Source identity**: the Git commit and working-tree state at the start,
   and a check at the end that the source did not change.
4. **Failed attempts**: every failed action or assertion stays in the
   record, including unplanned ones.
5. **Control**: the deliberate failing attempt and the restored passing
   attempt, both retained.
6. **Independent read**: for `question-completed`, a later read through a
   separate request, after the write.
7. **Images and inspection** (Journey B): the `dashboard-mobile` screenshot
   at 390x844, retained, and a written inspection made **after opening the
   image file**, comparing what it shows with the expected appearance.
8. **Secret handling**: the password and token do not appear in retained
   evidence.
9. **Cleanup**: the app process and the browser session are stopped, and a
   record shows it (for example a failed health request after the stop).
10. **Offline report**: one file (HTML or Markdown) that lists each claim,
    its outcome, its evidence, the control, the source identity, limits and
    cleanup, and that opens after cleanup.

The Spyglass arm meets the contract through its run, result and report. The
direct arm meets it with files it writes under `evidence/`. Direct scripts
are allowed; their code counts as driver code.

## 4. Measurements

All values come from the operator transcript, the retained evidence or the
Agent tool's usage report. A value that none of them supplies is recorded as
unavailable, never estimated.

| Measure                       | Definition                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verified claims               | Claims the coordinator verifies from retained evidence after cleanup (section 2.3).                                                                                                                                                                                            |
| Operator tool calls           | Every model tool call in the operator transcript (Bash, Read, Write, Edit, Glob, Grep and others). A Bash call with several shell commands counts as one.                                                                                                                      |
| Verified claims per tool call | Verified claims divided by operator tool calls.                                                                                                                                                                                                                                |
| Shell invocations             | Bash tool calls. Processes started inside one call are not counted separately.                                                                                                                                                                                                 |
| Wall time                     | The Agent tool's reported duration for the operator, from launch to final answer.                                                                                                                                                                                              |
| Phase time                    | Time from the first to the last tool call of each phase: discovery (reading help and files), drive (actions and assertions), record (result or report writing), cleanup. Phases come from transcript timestamps and the tool call content, assigned by the rules in section 7. |
| Tokens                        | The total tokens the Agent tool reports for the operator. Input/output split only when the transcript exposes it.                                                                                                                                                              |
| Driver code written           | Lines of content written with Write or Edit, plus lines beyond the first of each multi-line Bash command (heredocs and inline scripts). Evidence prose is included; it is not separable by rule.                                                                               |
| Unplanned failures            | Tool calls whose result reports a non-zero exit, a failed assertion or an error that is not the declared control's failing attempt.                                                                                                                                            |
| Deliberate controls           | Failing attempts made for the declared control.                                                                                                                                                                                                                                |
| Result rejections             | Spyglass arm: `spyglass result` or `spyglass finish` calls that exited non-zero at the result stage. Direct arm: not applicable (no validator); recorded as n/a.                                                                                                               |
| Coordinator help              | Any message from the coordinator to the operator after launch. The protocol allows none; each one is recorded.                                                                                                                                                                 |
| Human help                    | Any human input to the operator. The protocol allows none.                                                                                                                                                                                                                     |

## 5. Run plan

Two journeys × two arms × three repetitions = 12 operator runs. Each
(journey, repetition) **slot** runs its two arms at the same time, one
operator per arm, so both see the same machine load. Slots run one after
another. The slot order and the arm launched first in each slot come from a
seeded shuffle (seed `977cfd107adfb620`, a 64-bit LCG over the six slots,
then one draw per slot):

| Order | Slot     | Launched first |
| ----: | -------- | -------------- |
|     1 | C, rep 3 | direct         |
|     2 | B, rep 2 | Spyglass       |
|     3 | C, rep 2 | Spyglass       |
|     4 | C, rep 1 | direct         |
|     5 | B, rep 1 | Spyglass       |
|     6 | B, rep 3 | Spyglass       |

Run IDs are `<journey>-<arm>-r<rep>`, for example `B-direct-r2`.

## 6. Run directory preparation

For each run the coordinator creates `/tmp/m11/<run-id>/` with:

- `repo/`: a new Git repository with `fixtures/demo-app/` from the tested
  commit, `verification-plan.json` (the journey's claims and control in the
  Spyglass plan format, given to both arms as the task definition),
  `.gitignore` (`.spyglass/`, `evidence/`, `secrets.env`) and `secrets.env`
  (`DEMO_PASSWORD`, `DEMO_TOKEN`, generated per run), committed once.
- Spyglass arm only: `repo/spyglass.json`, the demo profile with a `${port}`
  binding, an `agent` seat that signs in from `env:DEMO_PASSWORD` and bearer
  token `env:DEMO_TOKEN`, and the two demo checks (`check.mjs pass` and
  `fail`) for Journey C; and `skill/`, a copy of `skills/spyglass/`.
- `bin/`: `node` (Node 24), `agent-browser` (0.38.2) and, for the Spyglass
  arm, `spyglass`, a wrapper that runs the tested build from a shared tools
  directory outside the run directories (`/tmp/m11/_tools/`).
- `state/`: the run's `XDG_STATE_HOME`.
- Direct arm only: an assigned free `PORT` written in the brief.

`agent-browser` sessions are named after the run ID, so no two operators
share a browser.

## 7. Briefs, procedure and validity

### 7.1 Briefs

The briefs below are frozen. `{RUN}`, `{RUN_ID}` and `{PORT}` are filled in
for each run; nothing else changes. The task and claim text is identical in
both arms; only the "Tools" section differs.

**Common part (both arms)**

```text
You are an operator verifying a small web app. Work only inside {RUN}.
Do not read, list or search any path outside {RUN}. Nobody will answer
questions; finish the task on your own.

Setup: run `export PATH={RUN}/bin:$PATH XDG_STATE_HOME={RUN}/state` and
`set -a; . {RUN}/repo/secrets.env; set +a` in every shell call that needs
them. The repository is {RUN}/repo. The app is
`node fixtures/demo-app/server.mjs`; it reads PORT, DEMO_PASSWORD and
DEMO_TOKEN, and GET /health returns 200 when it is ready. The demo user is
agent@example.test with the password in DEMO_PASSWORD. The API accepts
`Authorization: Bearer $DEMO_TOKEN`.

Task: verify every claim in {RUN}/repo/verification-plan.json, including its
control, and leave evidence that a reviewer can read offline after cleanup.
Keep every failed attempt. The evidence must contain:
1. each action with its time, command or request, exit or HTTP status and
   output;
2. for each claim, the expected and observed result tied to those actions;
3. the source identity (Git commit and working-tree state) at the start and a
   check at the end that it did not change;
4. every failed attempt, planned or not;
5. the control's deliberate failing attempt and its restored passing attempt;
6. for a side-effect claim, a later independent read after the write;
7. for a visual claim, the screenshot file and your inspection of it. Open
   the image file with your Read tool before you write what it shows;
8. no password or token value in the evidence;
9. cleanup: stop the app and any browser session, and record that they are
   stopped;
10. one offline report file that lists each claim and its outcome and
   evidence, the control, the source identity, limits and cleanup.
Do not change files under fixtures/. When you finish, answer with: the
report path, each claim's outcome, and any part of the task you could not
complete.
```

**Tools section, direct arm**

```text
Tools: shell, node, git, curl and agent-browser (run `agent-browser --help`).
Use the browser session name {RUN_ID}. Start the app on PORT={PORT}. You may
write scripts. Write all evidence under {RUN}/repo/evidence/, including the
report.
```

**Tools section, Spyglass arm**

```text
Tools: shell, node, git, curl, agent-browser and the spyglass CLI. Read
{RUN}/skill/SKILL.md first and use Spyglass for the run, steps, result and
report; `spyglass --help` documents each command. The profile is
{RUN}/repo/spyglass.json; it starts the app itself. Use the run ID {RUN_ID}.
The Spyglass report is the offline report.
```

### 7.2 Procedure

1. Build the tested commit; record the commit, tool versions and
   environment.
2. Prepare the 12 run directories (section 6).
3. For each slot in order, launch the two operators with their filled-in
   briefs, the first-launched arm first, and wait for both.
4. After each run, without changing its files: confirm the app port is
   closed and no browser session for the run is open; read the offline
   report and the evidence; apply the acceptance conditions (section 2.3);
   open the retained screenshot; read the transcript and record the
   measures in section 4.
5. Audit each transcript for paths outside its run directory, for reading
   another run's results and for coordinator or human messages.
6. Copy the sanitized measures and the retained evidence to the repository
   (section 8) and record the results in section 10.

Phase assignment from the transcript: a call is **discovery** until the
operator's first action on the app or a check (start of app, `up`, `check`,
browser or HTTP request); **record** starts at the first call that writes the
report or result (`result`, `result set`, `finish`, `report`, or writing the
report file); **cleanup** is any call that stops the app or browser
(`down`, `finish`, kill, `agent-browser close`) after the last drive action;
everything else between is **drive**.

### 7.3 Invalid comparisons

A run is **not comparable**, and is kept but not ranked, when:

- its verified claim set differs from the journey's full claim set;
- the operator read outside its run directory, read another run's evidence
  or received coordinator or human help that the other arm did not;
- the model or settings differ from the other arm in the slot;
- the tested build, fixture or brief differs from the frozen ones;
- the run was cut off by a harness limit rather than ending on its own.

A pair is compared only when both arms are comparable. Mean or median speed
claims across arms are not made from three repetitions.

## 8. Retention, redaction and repetition

- **Exploration and protocol repairs** happen before the freeze commit and
  are not scored. After the freeze, a protocol change is recorded in section
  9 with its reason, and every scored run that it affects is repeated.
- **Retained in Git** under `bench/results/m1.1/`: the per-run measures
  (`runs.json`), the coordinator's acceptance record for each run, the
  operator's final answer, and each run's evidence folder (Spyglass evidence
  folder or direct `evidence/`) with its offline report and screenshots. The
  demo app is a public fixture; its screenshots hold no private data.
- **Redaction**: the per-run `DEMO_PASSWORD` and `DEMO_TOKEN` are random
  values made for the study, and each retained file is scanned for them.
  Absolute temporary paths in the evidence (`/tmp/m11/...`) are kept where a
  retained checksum covers them, because rewriting them would break the
  record; they name only the disposable run directory. No other local path,
  user name or credential may appear. The retained files are scanned before
  commit.
- **Not retained**: operator transcripts (they hold the coordinator's
  session metadata); they are summarized in the measures.
- **To repeat**: check out the tested commit, follow section 6 and 7.2 with
  a new seed, and record a new results section. Keep earlier results.

## 9. Execution record

### 9.1 Protocol repair 1 (after slot 2, before any accepted comparison)

Two preparation defects were found in the first two slots (C rep 3 and B
rep 2). Both were in the coordinator's run directory preparation, not in
the operators' work:

1. The Journey B control declared the assertion name
   `status equals complete`. Spyglass `api --expect-json status=complete`
   records the assertion `json status=complete`, so no Spyglass step could
   match the declared name and `result` rejected the control with
   `CONTROL_INVALID`. The direct arm treats the name as prose and was not
   affected. Repair: the control's `assertion` is `json status=complete`.
   The control's meaning and the task text are unchanged.
2. `fixtures/demo-app/check.mjs` writes `check-output.json` in its working
   directory. The prepared `.gitignore` did not ignore it, so a Spyglass
   `check` that ran it made the source stale (`STALE_SOURCE`). Repair:
   `.gitignore` also lists `check-output.json`, as a real repository that
   runs this check would.

The four affected runs (`C-direct-r3`, `C-spyglass-r3`, `B-direct-r2`,
`B-spyglass-r2`) are superseded: they are retained as unscored records
(section 10.4) and both pairs are repeated with new operators. All run
directories were prepared again with the repair. Briefs are unchanged.

### 9.2 Environment and source

| Item              | Value                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tested CLI source | Spyglass 1.3.1. `src/`, `schemas/` and the build are identical from `247f965` (main) to the protocol freeze `03eee2e`; only docs changed.      |
| Platform          | Linux container in a Claude Code cloud session, run as root. Node 24.22.2 (installed for the study; the image has Node 22), Git 2.43.0.        |
| Browser           | `agent-browser` 0.38.2 (installed from npm) with the pre-installed Playwright Chromium build 1243.                                             |
| Docker            | Docker daemon started in the container; `postgres:17-alpine` pulled from Docker Hub.                                                           |
| Operators         | Claude Code `general-purpose` subagents, fresh context, the session's model (`claude-opus-5-5` for all 12 scored runs), default settings.      |
| Token metric      | The Agent tool reports a per-operator token total. Transcripts expose per-call usage; the per-call sums are recorded separately.               |
| Durable evidence  | No artifact service was used. Evidence is copied into this repository (section 10.5); the `/tmp/m11/` run directories expire with the session. |

### 9.3 Execution notes

- Slots ran in the frozen order. Each slot's two operators ran at the same
  time; no other benchmark or test ran during a slot.
- No coordinator or human message reached an operator after launch.
- No transcript names another run's directory. Every operator listed
  processes at least once (`ps`, `pgrep`), which can show other runs' process
  command lines. Two direct operators reported seeing another demo app
  process; none read its files. This is an isolation limit of a shared
  container.
- The harness gave every operator, in both arms, this repository's
  `AGENTS.md` as project context, because the coordinator session runs in
  this checkout. It describes Spyglass and the repository but contains no
  worked solution, task text or other run's results. It was equal across
  arms; it means the direct-arm operators knew Spyglass existed.
- Before slot 1, a killed first attempt of `bench/journey.mjs` (section
  10.1) had left a demo app and browser processes running; the coordinator
  stopped them before any operator started.

## 10. Results

### 10.1 Protocol checks and scripted measurements

These rows are scripted or test results. They involve no model; their
"operator steps" are shell invocations by a script, not model tool calls.

| Check                                                                | Outcome                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build`                                                      | Passed.                                                                                                                                                                                                                                                            |
| `npm run format:check`                                               | Passed.                                                                                                                                                                                                                                                            |
| `npm test` (as root)                                                 | 83 passed, 2 failed, 25 skipped. Both failures (`unreadable source fails verification…`, `a state permission failure is distinct from an active run lock`) depend on file permissions that root ignores.                                                           |
| The same 2 tests as a non-root user                                  | Passed.                                                                                                                                                                                                                                                            |
| `SPYGLASS_TEST_SURFACES=1 node --test … tests/e2e/surfaces.test.mjs` | 23 of 25 passed. The Docker/PostgreSQL test failed on a Docker Hub `429 Too Many Requests` pull and passed on rerun. `a proof right after ui open does not wait for the first browser frame` failed twice in a row (proof took about 9.6 s; limit 5 s).            |
| `node bench/overhead.mjs --label m1.1-cloud`                         | **Gate failed** in this container: added p50/p95 125.8/161.7 ms (`ui get title`), 129.7/155.3 ms (`ui expect`), 150.2/185.3 ms (`ui verify` 5 actions + proof). Cold start p50 84.9 ms, p95 107.1 ms. [Raw](../bench/results/overhead-2026-11-03-m1.1-cloud.json). |
| `node bench/journey.mjs --label m1.1-cloud` (20 runs)                | Completed. [Raw](../bench/results/journey-2026-11-03-m1.1-cloud.json). Table below.                                                                                                                                                                                |

| Scripted path                           | Wall p50 (s) | Wall p95 (s) | Processes | Scripted steps | Stdout bytes | Recorded steps | Artifacts | Failed attempts |
| --------------------------------------- | -----------: | -----------: | --------: | -------------: | -----------: | -------------: | --------: | --------------: |
| agent-browser + fetch                   |        11.79 |        12.06 |         6 |              1 |        11516 |              - |         - |               - |
| Playwright script                       |         1.50 |         1.62 |         2 |              1 |          850 |              - |         - |               - |
| Spyglass 1.2.0 (one operation per call) |        22.16 |        30.97 |        34 |             35 |        61363 |             34 |        32 |               1 |
| Spyglass composite workflow             |        20.69 |        29.08 |        12 |             13 |        26604 |             15 |        23 |               1 |

Conditions: each path runs warm after the first run in one process; no
cache was cleared between runs. The `agent-browser + fetch` wall times are
bimodal (about 2.4 s or about 11.9 s per run), which matches the roughly
10 s first-screenshot delay that the failing surface test detects. The
cloud container is slower than the machine behind the 2026-10-28 results,
so compare these rows with each other, not with the historical files. The
first journey attempt was stopped by a coordinator timeout and left no
result file.

### 10.2 Independent operator results

All 12 scored runs had every claim verified from retained evidence after
cleanup: the app port was closed, no browser session remained, no password
or token value appeared in the evidence, and the source was unchanged.
Review correction: the original coordinator marked all 12 accepted.
`runs.json` keeps that original judgement as `coordinatorOriginallyAccepted`
for the three corrected rows; no measured values changed.
Nine runs met full journey acceptance (section 2.3). The three Spyglass
Journey B runs did not meet the declared control, so they were not accepted
as equal-proof verifications and their pairs are not ranked (section 10.3). Raw values are in
[`runs.json`](../bench/results/m1.1/runs.json).

| Run           | Verified claims | Tool calls | Claims per call | Shell | Wall (s) | Tokens (harness) | Output tokens | Driver lines | Unplanned failures | `result` rejections |
| ------------- | --------------: | ---------: | --------------: | ----: | -------: | ---------------: | ------------: | -----------: | -----------------: | ------------------: |
| C-direct-r1   |               2 |          4 |            0.50 |     4 |     44.7 |            86404 |          4879 |           77 |                  0 |                 n/a |
| C-direct-r2   |               2 |          6 |            0.33 |     6 |     55.5 |            86083 |          5600 |           84 |                  2 |                 n/a |
| C-direct-r3   |               2 |          7 |            0.29 |     7 |     51.9 |            87518 |          5187 |           79 |                  0 |                 n/a |
| C-spyglass-r1 |               2 |          6 |            0.33 |     6 |     33.5 |            93167 |          2585 |           11 |                  0 |                   0 |
| C-spyglass-r2 |               2 |          5 |            0.40 |     5 |     28.3 |            91675 |          2359 |            6 |                  0 |                   0 |
| C-spyglass-r3 |               2 |          6 |            0.33 |     6 |     32.9 |            92989 |          2756 |            9 |                  0 |                   0 |
| B-direct-r1   |               6 |         14 |            0.43 |    13 |    101.1 |            95647 |          8670 |           98 |                  2 |                 n/a |
| B-direct-r2   |               6 |         12 |            0.50 |    11 |     88.2 |           103711 |          7824 |          107 |                  2 |                 n/a |
| B-direct-r3   |               6 |         17 |            0.35 |    16 |    106.9 |            95384 |          9398 |          117 |                  4 |                 n/a |
| B-spyglass-r1 |               6 |         25 |            0.24 |    24 |    138.1 |           119598 |         10831 |           44 |                  2 |                   0 |
| B-spyglass-r2 |               6 |         34 |            0.18 |    32 |    227.0 |           131025 |         19193 |           89 |                  2 |                   0 |
| B-spyglass-r3 |               6 |         20 |            0.30 |    19 |    121.1 |           114666 |          9465 |           34 |                  0 |                   0 |

Every run had one deliberate control failure. Tool calls exclude the
operator's final hand-back. Each Journey B operator opened its 390x844
screenshot with Read before recording the inspection (B-spyglass-r2 opened
two images). The coordinator also opened all six retained 390x844
screenshots: each shows the `Ask a question` heading, the `Question` field
and the green `Submit question` button inside the 390 px width, with no
clipping.

Unavailable: phase time. The transcripts have per-call timestamps, but
operators often combined discovery, drive, record and cleanup in one shell
call, so the section 7.2 phase rules cannot split them without guessing.
Only total wall time is reported. Driver lines include evidence prose and
report text that the direct arm writes by hand and the Spyglass arm gets
from `report`; they are not pure code.

### 10.3 Comparison at equal coverage

**Journey C (command only): comparable, all three pairs.** Both arms
verified the same 2 claims and the same control with the same assertion.
Ranges, direct then Spyglass: tool calls 4–7 vs 5–6; wall time 44.7–55.5 s
vs 28.3–33.5 s; output tokens 4879–5600 vs 2359–2756; harness tokens
86083–87518 vs 91675–93167; driver lines 77–84 vs 6–11; unplanned failures
0–2 vs 0. In each of the three pairs, the Spyglass operator finished sooner
and wrote fewer lines and output tokens; the tool call counts overlap.

**Journey B (browser and API): claims equal, control coverage not equal;
not ranked.** Both arms verified all 6 claims in every run. The control
differs: every direct operator made the declared failing read (a separate
`GET` straight after the `POST`, which saw `pending`). No Spyglass operator
could. The demo job completes about 180 ms after the `POST`, and each
`spyglass api` call takes longer than that to start, so 12 immediate
`spyglass api GET` attempts across the three runs all saw `complete`.
Spyglass accepted substitutes that its validator allows but that do not
match the declared read: the assertion on the `POST` response itself
(r1, r3), and a failing read in a separate baseline run against a
worktree with the app's timers slowed 100 times (r2). Under section 7.3,
these pairs are reported but not ranked. For reference, the raw ranges,
direct then Spyglass: tool calls 12–17 vs 20–34; wall time 88.2–106.9 s vs
121.1–227.0 s; output tokens 7824–9398 vs 9465–19193; driver lines
98–117 vs 34–89.

Three repetitions do not support a general speed claim in either
direction.

### 10.4 Superseded runs (unscored)

The four runs before protocol repair 1 (section 9.1) are kept under
[`superseded/`](../bench/results/m1.1/superseded/). `B-spyglass-r2-v1` is
also the first observation of the control timing problem, with an incomplete
report after 42 operator tool calls.

### 10.5 Evidence and retention

- [`bench/results/m1.1/runs.json`](../bench/results/m1.1/runs.json): the
  measures for each run, with the control method and unplanned failures.
- `bench/results/m1.1/runs/<run-id>/evidence/`: the Spyglass evidence
  folder (step log, artifacts, screenshots, `result.json`, offline HTML
  report) or the direct `evidence/` folder (action log, screenshots,
  report), plus the plan and, for Spyglass, the profile.
  `runs/B-spyglass-r2/baseline-run-evidence/` holds that operator's
  fault-injected baseline run.
- Redaction: the per-run demo password and token are absent from all
  retained files (scanned with every run's values). Two direct action logs
  captured process listings with host paths; those paths are replaced by
  `<host-path>`. Spyglass evidence keeps its `/tmp/m11/<run-id>` paths
  because its checksums cover them.
- Operator transcripts are not retained (section 8).

### 10.6 Findings and follow-up

**Largest observed source of unnecessary operator work: an immediate
read-after-write assertion in Spyglass.** It caused the most extra tool
calls in Journey B: 12 control reads that could not observe the state,
helper scripts outside the run (an argv preload, a timer-slowing module and
a Git worktree), 3 extra `result --check` rounds in one run, and the only
control coverage gap of the study. The direct arm met the same control in
one scripted `POST` then `GET`.

**Bounded follow-up (M1.2 candidate, not implemented here):** let one
`spyglass api` step make a write and its immediate follow-up read, for
example `api POST /questions --then GET /questions/{body.id}
--then-expect-json status=complete`, recording both requests and the
follow-up's assertion in the same step so it can back a control's failing
attempt. Acceptance checks:

1. A row in `docs/failure-cases.md` and an extended E2E test (written
   first) show that the follow-up read's assertion is recorded under its
   own name, fails while the job is pending, and can serve as a control's
   failed step, while a failed `POST` stops the step before the read.
2. The follow-up read cannot satisfy `independentRead` for a side-effect
   claim (it is not a later, separate read).
3. Repeat Journey B with fresh operators in both arms: every Spyglass run
   meets the declared control without helper scripts, and coverage equals
   the direct arm.

Other findings to keep visible: the overhead gate fails in this cloud
container; the first-frame proof surface test fails here; Journey C
Spyglass operators finished each pair sooner with less written output.

**Resolution note:** [M1.2](operator-comparison-m1.2.md) implements the bounded
API follow-up GET and records three fresh browser/API pairs. Every new
Spyglass run met the original control without helper scripts. The earlier
measurements and coverage limits above are unchanged; the new study uses
another model, harness and platform and is not a cross-study speed comparison.
