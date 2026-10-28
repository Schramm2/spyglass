# Verification speed

This doc records ideas to make a Spyglass verification quicker, smarter and
more efficient across every surface — browser, HTTP, PostgreSQL, Docker
Compose, repository checks, results and reports — and the plan to prove each
improvement.

This is a plan, not a contract. `README.md`, `src/help.ts` and
`docs/failure-cases.md` remain the contract. An idea becomes a contract only
when its failure case and its end-to-end test exist.

Read [ARCHITECTURE.md](../ARCHITECTURE.md) and
[browser-benchmark.md](browser-benchmark.md) first. Read `GLOSSARY.md` for the
terms.

## 1. Where the time goes

The CLI overhead is small. Paired comparisons on a 12-claim verification run
show the real cost.

| Measure                                  |        Baseline Pair 1 |    Baseline Pair 2 |
| ---------------------------------------- | ---------------------: | -----------------: |
| Wall time, direct tools then Spyglass    |     34.1 then 22.3 min | 21.9 then 25.6 min |
| Of which gates (`check-local` dominates) |      10.1 then 7.9 min |   6.2 then 8.9 min |
| Operator code written                    | 467 inline lines vs 15 |    187 vs 26 lines |
| Shell invocations                        |             54 then 81 |         46 then 72 |
| Recorded steps                           |            46 then 164 |        50 then 131 |
| Failed attempts / corrections            |           4/4 then 2/6 |      4/4 then 13/8 |
| `result` rejections                      |           not recorded |                  6 |
| Added cost per browser command           |           not measured |            91.7 ms |

The cost has five parts:

1. **Operator steps (turn multiplication).** One claim needs 8 to 20 CLI calls:
   open, snapshot, click, wait, snapshot, proof, API request, database read and
   log check. Each call costs one model turn (seconds of latency plus thousands
   of tokens). The direct arm wrote one 187-line Playwright script and ran it
   in one shell call; the Spyglass arm ran 72 shell calls and 112 recorded
   steps. This is the largest part.
2. **Result assembly and rejections.** In the second comparison, the
   operator edited `result.json` by hand and submitted it 6 times before it
   passed validation (uncited step, cited-gate bindings, missing control
   restored step, missing side-effect independent read). In 1.2.0 (`b08b655`),
   `up` and `status` print `resultRules` and `citedGateRun` compares only the
   bindings a step read (`43b582b`), but the operator still transcribes step
   IDs and artifact paths by hand at the end of the run.
3. **Failed attempts and selector or timing misses.** A stale browser session,
   a missed accessible name, an unready form or an unawaited background job
   costs two turns or more to inspect, diagnose and retry.
4. **Sequential waits across surfaces.** Polling an HTTP 202 job, waiting for a
   database row to appear, checking container health after startup and running
   multiple independent checks happen in serial operator loops instead of
   bounded CLI waits.
5. **Cold processes and repeated checks.** 91.7 ms added per browser command,
   135.3 ms per cold CLI start, plus full `git ls-files` source hashing on every
   non-`ui` command and a `ROLE_QUERY` privilege check on every `db` call. This
   part is small per call, but adds up across 100+ steps.

Consequence: **the loop must move into the CLI.** One CLI call must serve one
claim — or one complete action-settle-observe-prove cycle across browser, API,
database and container logs — not one low-level operation. And each step must
link itself to its claim as it runs, so `result.json` is ready before the
operator finishes driving.

## 2. Rule for every idea

A shorter run is an improvement only when it gives the same proof.

- The number of verified claims must stay the same.
- Each claim must keep its evidence, its source identity and its failed
  attempts.
- A faster run that covers fewer claims, skips an independent read, or lets
  the CLI invent semantic judgements or visual observations is not an
  improvement. Do not report it as one.
- Do not weaken isolation to gain milliseconds: keep the exact-origin proxy,
  the per-run and per-seat browser sessions, the run lock, secret masking,
  read-only extended-protocol SQL, and the source identity check.

The primary measure is **verified claims per operator step**. Time to equal
proof and total tokens are the secondary measures.

## 3. Goals

| Measure                                                 | Now (1.2.0 baseline) |                     Goal |
| ------------------------------------------------------- | -------------------: | -----------------------: |
| Operator steps for one 12-claim journey                 |             40 to 80 |                 12 to 20 |
| Recorded CLI calls per browser claim                    |              6 to 12 |                   1 to 2 |
| `result` rejections per run                             |        6 (pre-1.2.0) |                        0 |
| Hand-copied step IDs or artifact paths in `result.json` |          all of them | 0 (`--claim` links them) |
| Added cost per browser command, median                  |              91.7 ms |           120 ms or less |
| Added cost per browser command, p95                     | 163.6 ms (max of 20) |           150 ms or less |
| Cold CLI start                                          |             135.3 ms |           100 ms or less |
| Failed attempts per run                                 |              8 to 13 |                3 or less |

## 4. Completed in 1.2.0 (baseline)

Two items from the baseline comparison are already in `main` as of v1.2.0:

- **Cite a gate across runs with other bindings (`43b582b`, PR #11).**
  `validateGates` and `readBindings` in `src/report.ts` now check only the
  changed binding overrides that a cited gate step actually read (plus all
  launch bindings when `launch.mode` is `owned`). Per-installation ports that
  an `exec` or unrelated `check` did not read no longer block gate citation.
- **`resultRules` in `up` and `status` (`b08b655`, PR #13).** `up` and `status`
  return the plan-specific validation rules for claims, controls and gates so
  the operator sees them before editing `result.json`.

Keep both in the Tier 3 comparison baseline so their effect is measured before
and alongside the new slices below.

## 5. Ideas

### 5.1 Browser and `agent-browser`: one call per claim

Today an operator verifying one UI claim runs `ui open`, `ui snapshot`,
`ui find ... click`, `ui wait ...`, `ui snapshot`, `ui focused`, and
`ui proof LABEL` as 5 to 8 separate CLI calls. Each call spawns Node, reads
`run.json`, checks the proxy, spawns `agent-browser`, parses stdout and returns
to the model.

| Idea                                                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Feasibility                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`ui expect`**                                                 | One call checks one or more conditions without a manual snapshot loop: `--url PATTERN`, `--text SUBSTRING`, `--title TEXT`, `--selector SEL`, `--visible SEL`, `--hidden SEL`, `--enabled SEL`, `--checked SEL`, `--count SEL=N`, `--focused LABEL`, `--attr SEL:NAME=VALUE`, `--no-errors`. Polls inside the CLI until `--timeout-ms` (default 5000 ms), saves `expect.json` evidence, and exits 0 or 1 with a one-line summary (`PASS url=/dashboard text="Welcome"`). Note: never read input values (`get value` stays refused).                                            | Small. Builds on `agent-browser wait`, `is`, `get` and `focusedElementScript` in `src/browser.ts`.                                                                                                                                                                                                                                                                             |
| **`ui verify` (composite action + settle + expect + proof)**    | One call runs a sequence of actions, expectations and an optional proof bundle in a single `agent-browser batch --bail` invocation: `spyglass ui verify --claim ID [--seat SEAT] [--open PATH] --do "find role button click --name Submit" --expect url=/dashboard --expect text="Ask a question" --proof dashboard`. Stops at the first failed action or expectation, retains the passed sub-steps and the failure state (including a failure screenshot and delta snapshot on error), and records **one step with structured `claims` assertions** plus all proof artifacts. | Medium. `src/browser.ts` already sends `batch --bail --json` (up to 30 commands). Today line 1412 forbids `screenshot` inside a multi-command batch because raw `screenshot` arguments could write outside evidence; `ui verify --proof LABEL` generates the safe `proofPath` inside `src/browser.ts` and appends the `proof` command sequence safely at the end of the batch. |
| **`ui proof` with inline `--expect` and `--viewport`**          | Extend `ui proof LABEL` to accept `--viewport WxH` (or repeatable `--viewport 1280x800 --viewport 390x844`) and `--expect ...`. In one step and one batch, Spyglass resizes the viewport, waits for layout to settle, checks expectations, captures each viewport's screenshot (`proof-LABEL-1280x800.png`, `proof-LABEL-390x844.png`), delta snapshot, console/network deltas, and pre-populates the visual claim's `inspections` entries with `viewport` and `artifact` (leaving `observed` for the operator after viewing the image).                                       | Small-Medium. Eliminates 4–6 separate `ui set viewport` + `ui proof` calls on responsive claims.                                                                                                                                                                                                                                                                               |
| **Automatic settle after interactive actions**                  | After `click`, `dblclick`, `press`, `fill`, `select` or `find ... click` inside `ui verify` (or with `--settle`), wait briefly for pending navigation and DOM mutations to settle before running the next `--expect` or `proof`. Avoids arbitrary `wait 2000` sleeps and prevents race conditions without hanging on SSE/WebSocket streams where `--load networkidle` never resolves.                                                                                                                                                                                          | Small.                                                                                                                                                                                                                                                                                                                                                                         |
| **Focus before/after in one step (`ui verify --focus-change`)** | Proving focus movement today requires 3 turns: `ui focused` (before), the action, and `ui focused --expect Password` (after) — a major friction point in baseline comparisons. Allow `--expect-focus-moved LABEL` in `ui verify`: it records `focusedElementScript` before the `--do` actions and asserts that focus moved to `LABEL` afterward, storing both `before` and `after` in `focused.json`.                                                                                                                                                                          | Small. `focusedElementScript` already exists in `src/browser.ts:1253`.                                                                                                                                                                                                                                                                                                         |
| **Selector diagnostics on failure**                             | When `ui find` or a selector action fails (such as `none match name` or timeout), automatically run a compact interactive accessibility snapshot (`snapshot -i -c`) in the error handler and include the 10 nearest interactive roles and labels in the error output and retained failure artifact. The operator fixes a stale selector in 1 turn instead of 3, and immediately distinguishes map drift from a product defect.                                                                                                                                                 | Medium. Similar to `captureFailure` in `src/browser.ts:949`.                                                                                                                                                                                                                                                                                                                   |
| **Sign-in recovery on `BROWSER_EXPIRED`**                       | When a command hits `BROWSER_EXPIRED` for a seat that has `profile.seats.<seat>.login`, offer `--relogin` (or profile policy `reloginOnExpire: true`) that runs the seat login first as a recorded attempt in the step and then runs the requested command, instead of costing two extra turns.                                                                                                                                                                                                                                                                                | Medium. Must keep the expiry event visible in the step record.                                                                                                                                                                                                                                                                                                                 |
| **`ui journey NAME` in profile**                                | Allow `profile.journeys` (or `profile.checks` with a browser runner) to declare reusable parameterized `ui verify` sequences (with `${binding}` templates) for flows that repeat across runs, while keeping ad-hoc `ui verify` for new claims.                                                                                                                                                                                                                                                                                                                                 | Medium.                                                                                                                                                                                                                                                                                                                                                                        |

Design constraint: a batch in `ui verify` is **one step with ordered sub-steps
and structured `claims` assertions**, in the same shape that `check` uses for
assertions (`src/checks.ts:9`). Never hide a failed action or assertion. If
step 3 of 5 in a batch fails, the step record shows steps 1–2 passed, step 3
failed, and steps 4–5 not run, with exit code 1.

### 5.2 API, PostgreSQL and Docker Compose: faster multi-surface proof

Agents spend many turns coordinating HTTP requests, async job polling, database
reads and container log checks around a side-effect claim.

| Idea                                                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Feasibility                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **`api` body expectations (`--expect-json`)**                | Extend `spyglass api` beyond `--expect STATUS` with `--expect-json PATH=VALUE` (or `--expect-body-contains TEXT`, `--expect-json PATH!=VALUE`). Checks JSON fields (for example `--expect-json status=ok` or `--expect-json items.length=3`), records each as a structured assertion on the step, and exits 1 on mismatch.                                                                                                                                                            | Small. `src/surfaces.ts` already parses the JSON response body.                            |
| **`api` bounded polling for async jobs (`--wait-for`)**      | When an API endpoint returns 202 or starts background work, the operator currently writes a shell loop or runs `api GET /jobs/123` repeatedly across turns. Add `spyglass api GET /jobs/123 --wait-until status=complete --fail-on status=failed --timeout-ms 15000 --interval-ms 250`. It polls within one CLI step, retains the poll count, elapsed time and final response in `api-response.json`, and satisfies `independentReadComplete` (`src/report.ts:611`) in a single call. | Small-Medium. Directly targets the 202-to-complete requirement in `docs/failure-cases.md`. |
| **`db` value assertions (`--expect-col`, `--expect-value`)** | Today `spyglass db` only checks `--expect-rows N`. Add `--expect-col COLUMN=VALUE` (asserts row 0's column value, or all rows) and `--expect-empty` (alias for `--expect-rows 0`). Records structured assertions in `database-result.json` so a negative control or claim can assert on exact stored data without a custom check script.                                                                                                                                              | Small. `src/surfaces.ts:460`.                                                              |
| **Cache `ROLE_QUERY` per database connection/run**           | Today every `spyglass db` call runs `BEGIN READ ONLY`, `SET LOCAL statement_timeout`, `SET LOCAL lock_timeout`, and the 30-line `ROLE_QUERY` privilege inspection (`src/surfaces.ts:27`, `519`) before running the user's `SELECT`. `doctor` already runs `readDatabaseRole` at `up`. Cache the role inspection in `run.json` (keyed by connection string hash) and refresh it only on `doctor` or when missing, cutting per-query round-trips from 7 to 4.                           | Small. Preserves `BEGIN READ ONLY` and extended-protocol safety on every query.            |
| **Auto-mark on every step (`logs --since-step STEP_ID`)**    | Operators often forget to run `spyglass mark LABEL` before an action fails, losing the exact log window and having to re-run the failure. Every `Step` in `log.jsonl` already records `startedAt` (`src/state.ts:398`). Allow `spyglass logs [SERVICE] --since-step STEP_ID` and `--since-last` (since the previous step's `startedAt`), plus `--grep PATTERN` and `--expect-text TEXT` / `--forbid-text TEXT`. Eliminates the separate `mark` turn before every drive step.          | Small. `mark` stays supported; `--since-step` reads `steps(run)`.                          |
| **`ps --wait-healthy`**                                      | Allow `spyglass ps --wait --timeout-ms 30000` to poll `docker compose ps --format json` until all `profile.compose.required` services are `running` and (when a healthcheck is defined) `healthy`, instead of failing immediately while a container finishes booting. Also check `container.health !== "unhealthy"` and `"starting"` when health is present (today `containerReady` in `src/surfaces.ts:1160` checks only `state === "running"`).                                     | Small. Improves both speed (no manual retry turns) and accuracy.                           |

### 5.3 Live claim linking and zero-rejection results

In baseline runs, the operator spent 6 turns fixing `result.json`
rejections and wrote 22 lines of script just to edit `result.json`. Even with
`resultRules` in 1.2.0, assembling `result.json` at the end of a 130-step run
forces the model to scan `log.jsonl` or `status`, match 12-char step IDs and
relative artifact paths, and edit a large JSON file.

| Idea                                                                                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Feasibility                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tag steps as they run (`--claim`, `--control`, `--gate`)**                             | Allow any driving command (`ui`, `api`, `db`, `check`, `exec`, `evidence add`) to take `--claim ID` ( plus `--independent-read` when the step is the later read for a side-effect claim), `--control ID:failed\|restored`, or `--gate NAME`. When a step finishes, Spyglass automatically appends its step ID and any produced non-administrative artifacts to that claim, control or gate in the pending `.spyglass/runs/<id>/spyglass/result.json`.                                                                                           | Small-Medium. Eliminates manual transcription of step IDs and artifact paths — the #1 source of `ARTIFACT_PRODUCER_MISMATCH`, `MISSING_STEP` and `INDEPENDENT_READ_MISSING` rejections. |
| **`spyglass claim` / `result set` CLI helper**                                           | Provide `spyglass result set --claim ID --outcome passed --observed "..." [--inspect VIEWPORT:ARTIFACT --expected "..." --observed "..."]` and `--gate-run RUN_ID` (fills all planned gates from an earlier passing run on the same source). The operator never has to hand-edit raw JSON arrays or risk syntax errors.                                                                                                                                                                                                                         | Small.                                                                                                                                                                                  |
| **`result --check` (dry-run validation with exact repair commands)**                     | Validate `.spyglass/runs/<id>/spyglass/result.json` (by default, without requiring `--file` when using the run's own `resultPath`) without recording it. Return _all_ findings at once (today `result` throws on the first `invalidMatrix` or `proofFailure` in `src/report.ts:1243`, forcing one rejection per mistake!), and attach a concrete `repair` hint to each finding (for example, listing the candidate GET/db steps in the log that could satisfy `INDEPENDENT_READ_MISSING`, or the exact artifact path produced by a cited step). | Small. High impact: reporting all findings together turns 6 sequential rejections into at most 1 repair turn.                                                                           |
| **Default `--file` on `result`**                                                         | Make `--file` optional in `spyglass result [--file PATH] [--check]`: default to `run.resultPath` (`.spyglass/runs/<id>/spyglass/result.json`), which `up` already created.                                                                                                                                                                                                                                                                                                                                                                      | Trivial. Saves looking up and typing the path on every run.                                                                                                                             |
| **Inline `_rules` and candidate steps in `status --work`**                               | Add `spyglass status --work` (or include `work` in `status --run ID`). For each pending claim, control and gate, print what is still missing (`needs: behavior step`, `needs: independentRead after step 8a1f...`, `needs: visual inspection for 1280x800 screenshot 8a1f...-1-proof.png`, `needs: observed text`).                                                                                                                                                                                                                             | Small. The operator sees the exact delta to completion in one glance.                                                                                                                   |
| **Auto-cite gates from a same-source run (`up --cite-gates-from RUN` or `status` hint)** | When starting a second run on the same `source.hash` and `profileHash` (such as running a second plan on the same repository), `up` detects that an earlier run in `stateRoot` already passed the plan's `gates` with compatible bindings, pre-fills `gates[].run` and `gates[].steps` in the new run's `result.json` template, and notes it in `status`.                                                                                                                                                                                       | Small-Medium. Saves 6–10 minutes of redundant gate execution when the operator forgets they can cite across runs.                                                                       |

### 5.4 Faster lifecycle, warm start and hot path

Do the process/warm-start optimizations that have low isolation risk alongside
5.1–5.3; keep the local daemon (`spyglass serve`) gated on p95 measurements.

| Idea                                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Feasibility                                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Parallel `doctor` and `up --warm`**                              | In `src/lifecycle.ts:463`, `doctor` runs `agent-browser --version`, `docker compose version --short`, the owner doctor, `ready()`, `readDatabaseRole()` and `browserDoctor()` sequentially. Run the independent tool/readiness probes in parallel with `Promise.all`. Add `up --warm [--seat SEAT]` to start the exact-origin browser proxy and launch the seat's headless browser (and optional seat `login`) in parallel with app readiness.                                                                                                                                                                                                                                  | Medium. Moves the 1–3 s browser/proxy cold start behind app startup.                                                      |
| **Fast source-identity check on the command path**                 | Today `assertSource(run)` (`src/state.ts:310`) runs `git ls-files --cached --others`, `git ls-files --stage`, `git rev-parse HEAD`, and reads + SHA-256 hashes _every source file in the repository_ synchronously before and after every `check`, `exec`, `api` and `db` command. On a large repo, that adds hundreds of milliseconds per `api` or `db` call. Optimize `sourceChanges(run)`: first check `git status --porcelain -z` + `HEAD` + `(mtimes, sizes)` against a cached stat table in `runHome`, and re-hash only files whose `mtime`/`size` or git index status changed; keep the full unconditional byte-for-byte SHA-256 re-hash in `up`, `doctor` and `report`. | Medium. Huge speedup on large repos for `api`, `db`, `check` and `exec` with zero loss of final-report integrity.         |
| **Parallel checks and gates (`check a,b` or `check --gates`)**     | Allow `spyglass check lint,typecheck,unit` (or `spyglass check --all-gates`) to run read-only/independent checks concurrently up to `--concurrency N`, recording a separate `Step` and artifact set for each check. To keep the run lock safe, the parent CLI process holds the run lock and writes each completed step to `log.jsonl` serially as each child finishes.                                                                                                                                                                                                                                                                                                         | Medium. Can cut multi-gate wall time by 30–50%.                                                                           |
| **`finish` (`result` + `doctor` + `down` + `report` in one call)** | At the end of every run, the operator executes 4 sequential commands (`result`, `doctor`, `down`, `report`) — 4 model turns for a fixed ritual. Add `spyglass finish [--file PATH]`: it validates and records the result, runs `doctor` (while the target is still up), runs `down` (and optional owner cleanup check when `--cleanup` is passed), and generates `report`. If any stage fails, it stops at that stage, records the step, and names the repair.                                                                                                                                                                                                                  | Small-Medium. Saves 3 operator turns on every single run while preserving the individual commands and their step records. |
| **Single-file / startup-optimized bundle**                         | Measure module load cost on Node 24 (`135.3 ms` cold start for `--version`). Keep lazy dynamic `import()` in `src/cli.ts`, pre-compile JSON schemas into `dist/` instead of importing `zod` on paths that do not validate schemas, and test Node compile cache (`NODE_COMPILE_CACHE` / `module.enableCompileCache()` in Node 22.8+/24).                                                                                                                                                                                                                                                                                                                                         | Small. `module.enableCompileCache()` is built into Node 24 and requires 1 line at the top of `src/cli.ts`.                |
| **Local server (`spyglass serve`)**                                | A per-run background process listening on a mode-`0600` unix socket in `runHome`. Cuts per-call CLI overhead from ~92 ms to ~2 ms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Large. Build only if `enableCompileCache` and `ui verify` batching still leave p95 above 150 ms.                          |

### 5.5 Less context and token waste for the operator

Every kilobyte of stdout enters the agent's context window and slows down every
subsequent turn in the session.

| Idea                                              | Change                                                                                                                                                                                                                                                                                                               | Feasibility                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Bounded observation summary on `ui` and `api`** | When `ui verify`, `ui proof` or `ui snapshot` runs, return a compact `observation` block first: `{ url, title, focused, consoleErrors, failedRequests, interactiveCount, changedLines, artifacts }`, and keep full DOM trees in the saved `page-snapshot` artifact when they exceed a tight line budget.             | Small.                                                                            |
| **`replay --from RUN [--failed-only]`**           | After fixing a defect and starting a new run on the new source baseline, `spyglass replay --from OLD_RUN` lists or re-executes the non-administrative steps (`check`, `exec`, `api`, `db`, `ui`) cited by failed claims or controls in `OLD_RUN`, and automatically links `failedRun: OLD_RUN` on matching controls. | Medium. Directly accelerates step 4 of the agent workflow ("Correct and repeat"). |
| **Exact repair command on every `Fault`**         | Audit every `new Fault(code, message, next)` across `src/` so `next` always includes the concrete `--run <id>` (or `SPYGLASS_RUN=<id>`) and the exact flag/seat/path from the current context.                                                                                                                       | Small.                                                                            |

## 6. How to prove it

Three tiers. Each tier writes a file that stays in the repository, except a
paired run that uses private data.

### Tier 1: a scripted journey, no model

Write `bench/journey.mjs`. It drives one fixed 12-claim journey on
`fixtures/demo-app` (covering sign-in refusal, focus check, valid login,
dashboard expectations, visual proof at two viewports, async 202 question
submission + completion poll, independent read, console/error page check,
negative control failure + restore, result, cleanup and offline report) through
four paths:

| Path                                                                  | What it measures                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `agent-browser` + `fetch` directly                                    | The raw tool floor (no run state, proxy or evidence report). |
| A Playwright script                                                   | The "inline script" baseline from the direct arm.            |
| Spyglass 1.2.0 (one operation per call)                               | Today's CLI workflow.                                        |
| Spyglass with `ui verify`, `api --wait-until`, `--claim` and `finish` | The proposed workflow.                                       |

Record these measures for each path:

- wall time, median and p95 of 20 runs;
- CLI processes started;
- shell invocations (operator steps);
- bytes on stdout that the driver must read;
- recorded steps and retained artifacts;
- failed assertions and retries.

No model is involved, so any difference comes directly from the CLI design and
command granularity. Write `bench/results/<date>.json` and add a summary table
to this doc.

### Tier 2: the overhead gate

Extend [browser-benchmark.md](browser-benchmark.md):

- measure p50 and p95 across 20 pairs, not only the median;
- measure cold start (`spyglass --version`), warm `ui get title`, `ui expect`,
  and a 5-action `ui verify --proof` batch against direct `agent-browser batch`;
- verify that `module.enableCompileCache()` and stat-cached `sourceChanges`
  reduce cold and warm overhead;
- add a benchmark script that exits non-zero when p50 added time exceeds
  120 ms or p95 exceeds 150 ms.

### Tier 3: a paired operator run

Run one fresh operator for each arm, with the same model, the same claims, a
random order, and three repetitions. Record wall time for each phase
(discovery, setup, drive, result/report, gates, cleanup), operator steps,
shell invocations, tokens, failed attempts, `result` rejections, code written,
coordinator help and human help.

Keep the run record outside the repository when it contains private data.

### What to compare

| Measure                           | Definition                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------- |
| Verified claims                   | Claims that passed with a completed step and existing artifacts.                  |
| Verified claims per operator step | Verified claims divided by model tool calls during Drive + Report.                |
| Operator steps                    | One model tool call. Count a shell invocation with many commands as one step.     |
| Shell invocations                 | One process that the operator started.                                            |
| `result` rejections               | Submissions to `spyglass result` that exited non-zero.                            |
| Tokens                            | The harness total for the run, with its limit.                                    |
| Failed attempts                   | Steps that ended in a failed expectation or a rejected result.                    |
| Time to equal proof               | Wall time from the first command to a complete report at the same claim coverage. |

A run stops being comparable when its claim coverage differs. Mark it as not
comparable and keep the record.

## 7. Order of work

| Order | Slice                                                                                                                                                    | Goal                                                     | Target                              | Depends on                                  |
| ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------- | ------------------------------------------- |
|  Done | Gate binding citation (`43b582b`) + `resultRules` (`b08b655`)                                                                                            | Cross-run gate reuse and upfront rules                   | Shipped in v1.2.0                   | —                                           |
|     0 | Tier 1 & Tier 2 benchmark harness (`bench/`)                                                                                                             | A reproducible number for every later slice              | 12 claims, four paths, p50 + p95    | `fixtures/demo-app`, `agent-browser` 0.38.2 |
|     1 | `result --check` (all findings + repairs), default `--file`, `result set`, and `--claim` / `--control` / `--gate` step tagging                           | Zero hand-transcription errors and zero rejected results | 0 `result` rejections               | 0                                           |
|     2 | `ui expect`, settle, and selector failure diagnostics                                                                                                    | Fewer browser turns and faster selector recovery         | 40% fewer browser steps             | 0                                           |
|     3 | `ui verify` batch (with `--proof`, `--viewport`, `--expect-focus-moved`) and `ui proof --viewport` / `--expect`                                          | One CLI call per UI claim                                | 70% fewer browser calls             | 2                                           |
|     4 | Multi-surface speedups: `api --expect-json` & `--wait-until`, `db --expect-col` & cached `ROLE_QUERY`, `logs --since-step`, `ps --wait`                  | One CLI call per API/DB/Compose check or async poll      | 50% fewer non-UI steps              | 0                                           |
|     5 | `status --work`, auto-cited gates on same-source `up`, and `spyglass finish`                                                                             | Fewer orchestration turns at start and end of run        | 4 to 6 fewer turns per run          | 1                                           |
|     6 | Fastpath & warm start: `module.enableCompileCache()`, stat-cached `sourceChanges`, parallel `doctor`/`up --warm`, parallel `check a,b`, sign-in recovery | Lower per-call latency and faster startup/gates          | <100 ms cold start, <150 ms p95     | 3, 4                                        |
|     7 | `replay --from RUN`, bounded observations, and exact repair commands on every `Fault`                                                                    | Faster defect re-verification and lower token use        | 30% fewer tokens                    | 1, 3                                        |
|     8 | Local server (`spyglass serve`)                                                                                                                          | Sub-5 ms CLI dispatch                                    | Only if Slice 6 misses the p95 gate | 6                                           |

Every slice starts with its failure case and its end-to-end test. Add the row
to [failure-cases.md](failure-cases.md) first. Then write the test. Then
write the code. When a slice changes a command, option, output field or schema,
update `README.md`, `src/help.ts`, `skills/`, `landing/docs/index.html` and
`CHANGELOG.md` as required by [agent_docs/delivery.md](../agent_docs/delivery.md).

### Slice 0: Tier 1 & Tier 2 benchmark harness (`bench/`)

- **Files:** `bench/journey.mjs`, `bench/overhead.mjs`, `docs/browser-benchmark.md`, `docs/verification-speed.md`.
- **Changes:**
  - Create `bench/overhead.mjs` to measure cold CLI start (`spyglass --version`) and 20 warm pairs of `ui get title` (and later `ui expect` and `ui verify --proof`) against direct `agent-browser batch --bail --json`. Compute median (p50) and p95 added latency, and exit non-zero when p50 > 120 ms or p95 > 150 ms.
  - Create `bench/journey.mjs` to run the 12-claim journey against `fixtures/demo-app` across the Spyglass 1.2.0 baseline path and the proposed composite path, recording wall time (p50/p95), CLI processes spawned, shell invocations, stdout bytes, recorded steps and retained artifacts to `bench/results/<date>.json`.
- **Acceptance checks:** `node bench/overhead.mjs` and `node bench/journey.mjs` pass on a machine with `agent-browser` 0.38.2 and Chromium.

### Slice 1: Live claim linking, `result --check`, default `--file` and `result set`

- **Files:** `docs/failure-cases.md`, `tests/e2e/core.test.mjs`, `src/cli.ts`, `src/state.ts`, `src/report.ts`, `src/help.ts`, `README.md`, `skills/spyglass/SKILL.md`, `landing/docs/index.html`, `CHANGELOG.md`.
- **Failure cases & E2E tests (write first):**
  - `result` or `result --check` inspects a result file with multiple independent errors and returns all findings together in `data.findings` with concrete `repair` hints; `--check` does not record `run.result`.
  - `result` with no `--file` defaults to `run.resultPath`.
  - A step run with `--claim ID` (and optional `--independent-read`), `--control ID:failed|restored` or `--gate NAME` updates the pending `result.json` template on pass; a failing `--claim ID` step is retained in `log.jsonl` and rejected with `FAILED_STEP` if the claim is marked `passed` without a passing step.
  - `result set` updates claim outcomes, observations, visual inspections and gate citations in `run.resultPath` without manual JSON editing.
- **Changes:**
  - Parse global/driving step-linking flags (`--claim ID`, `--independent-read`, `--control ID:failed|restored`, `--gate NAME`) in `src/cli.ts` / `Context.finish` (`src/state.ts`). When a step finishes, update the pending result file at `run.resultPath` (append `step.id` to `steps`, append non-administrative artifacts to `artifacts`, set `independentRead: true` when requested), while keeping `observed` and `inspections[].observed` blank for operator judgement.
  - In `src/report.ts`, make `--file` optional on `result` (defaulting to `ctx.run.resultPath`), add `--check` (dry-run validation that does not set `ctx.run.result`), return all findings at once with a `repair` field on each finding, and add `result set`.
- **Acceptance checks:** `npm test` and `npm run format:check` pass.

### Slice 2: `ui expect`, automatic settle and selector failure diagnostics

- **Files:** `docs/failure-cases.md`, `tests/e2e/surfaces.test.mjs`, `tests/e2e/core.test.mjs`, `src/browser.ts`, `src/help.ts`, `README.md`, `skills/spyglass/SKILL.md`, `landing/docs/index.html`, `CHANGELOG.md`.
- **Failure cases & E2E tests (write first):**
  - `ui expect` polls until `--timeout-ms` and fails with exit status 1 when an expectation never passes, recording the last observation, elapsed time and `expect.json`.
  - `ui find` or a selector action that matches no element fails with exit status 1 and includes the nearest accessible roles and labels from the current page in its error data and retained failure snapshot.
- **Changes:**
  - Add `ui expect` in `src/browser.ts` supporting `--url`, `--text`, `--title`, `--selector`, `--visible`, `--hidden`, `--enabled`, `--checked`, `--count`, `--focused`, `--attr`, `--no-errors` and `--timeout-ms` (default 5000). Never read input values (`get value` stays refused). Retain `expect.json` and structured step assertions.
  - Add bounded DOM/navigation settle after interactive actions (`click`, `dblclick`, `press`, `fill`, `select`, `find ... click`) when `--settle` is passed or inside `ui verify`.
  - In `captureFailure` / selector error handling (`src/browser.ts`), run a compact interactive accessibility snapshot (`snapshot -i -c`) and attach up to 10 nearest interactive roles/labels to the error data and failure artifact.
- **Acceptance checks:** `npm test`, `SPYGLASS_TEST_SURFACES=1 npm test` (when Chromium is available), and `npm run format:check` pass.

### Slice 3: `ui verify` batch and `ui proof` inline `--viewport` / `--expect`

- **Files:** `docs/failure-cases.md`, `tests/e2e/surfaces.test.mjs`, `tests/e2e/core.test.mjs`, `src/browser.ts`, `src/report.ts`, `src/help.ts`, `README.md`, `skills/spyglass/SKILL.md`, `landing/docs/index.html`, `CHANGELOG.md`.
- **Failure cases & E2E tests (write first):**
  - A `ui verify` batch action passes, but a later expectation in the same call fails: the step fails at that expectation, captures failure evidence, keeps the passed actions and failed assertion in the step record, and exits 1.
  - A `ui verify` batch action targets an origin outside the allowlist: the call fails with `BROWSER_ORIGIN_BLOCKED` and retains the actions that ran.
  - `ui verify --expect-focus-moved LABEL` sees focus already on `LABEL` before the action, or on another element after: fails with `BROWSER_EXPECTATION_FAILED` and retains `before` and `after` in `focused.json`.
  - `ui verify --proof` or `ui proof` with multiple `--viewport` values fails an expectation on one viewport: retains screenshots captured up to the failure and does not mark the visual claim passed.
  - A batch step cites an expectation that did not run: the claim cannot pass and `result` names the missing expectation.
- **Changes:**
  - Implement `spyglass ui verify` in `src/browser.ts`: accepts `[--seat SEAT] [--open PATH] [--do CMD]... [--expect COND]... [--expect-focus-moved LABEL] [--proof LABEL] [--viewport WxH]... [--claim ID]`.
  - Generate safe `proofPath` values inside `src/browser.ts` so `ui verify --proof` and `ui proof --viewport WxH --expect ...` can batch viewport resize, settle, expectations, screenshots (`proof-LABEL-WxH.png`), delta snapshots and console/network deltas safely without allowing raw external screenshot paths.
  - Pre-populate `inspections` entries (`viewport` and `artifact`, leaving `observed: ""`) in `run.resultPath` when `--claim` is given on a visual claim.
  - Record ordered sub-steps and structured `claims` assertions on the step so `validateClaimProof` in `src/report.ts` verifies that all expectations ran and passed.
- **Acceptance checks:** `npm test`, `SPYGLASS_TEST_SURFACES=1 npm test`, and `npm run format:check` pass.

### Slice 4: Multi-surface speedups (`api`, `db`, `logs`, `ps`)

- **Files:** `docs/failure-cases.md`, `tests/e2e/core.test.mjs`, `tests/e2e/surfaces.test.mjs`, `src/cli.ts`, `src/surfaces.ts`, `src/state.ts`, `src/lifecycle.ts`, `src/report.ts`, `src/help.ts`, `README.md`, `skills/spyglass/SKILL.md`, `landing/docs/index.html`, `CHANGELOG.md`.
- **Failure cases & E2E tests (write first):**
  - `api --wait-until` times out while the job remains `pending` (or reaches a `--fail-on` state): exits 1 with `API_EXPECTATION_FAILED`, retains the poll count and final response artifact, and cannot satisfy an `independentRead`.
  - `api --expect-json` sees a different field value or missing path despite HTTP 200: exits 1, records the failed assertion on the step, and retains the masked response.
  - `db --expect-col` sees a different column value despite a matching row count: exits 1 with `DATABASE_EXPECTATION_FAILED` and retains the bounded query result.
  - `logs --since-step` names an unknown step ID (`UNKNOWN_STEP`), or `--forbid-text` matches a log line (exits 1 and retains the log artifact).
- **Changes:**
  - Extend `api` (`src/surfaces.ts`) with repeatable `--expect-json PATH=VALUE` / `PATH!=VALUE`, `--expect-body-contains TEXT`, and bounded polling `--wait-until PATH=VALUE`, `--fail-on PATH=VALUE`, `--timeout-ms MS`, `--interval-ms MS`. Record structured assertions and poll metadata (`polls`, `elapsedMs`) in `api-response.json` and step data so a completed poll satisfies `independentReadComplete` (`src/report.ts`).
  - Extend `db` (`src/surfaces.ts`) with `--expect-col COL=VALUE` and `--expect-empty`. Cache `ROLE_QUERY` role inspection in `run.json` keyed by connection string hash (populated by `doctor` / first `db` call, refreshed on `doctor`) while keeping `BEGIN READ ONLY`, timeouts and extended-protocol single-statement execution on every query.
  - Extend `logs` (`src/surfaces.ts`) with `--since-step STEP_ID`, `--since-last`, `--grep PATTERN`, `--expect-text TEXT` and `--forbid-text TEXT`.
  - Extend `ps` (`src/surfaces.ts`) with `--wait` and `--timeout-ms MS`, checking container health (`healthy` vs `starting`/`unhealthy`) when defined.
- **Acceptance checks:** `npm test`, `SPYGLASS_TEST_SURFACES=1 npm test`, and `npm run format:check` pass.

### Slice 5: `status --work`, same-source gate auto-citation and `spyglass finish`

- **Files:** `docs/failure-cases.md`, `tests/e2e/core.test.mjs`, `src/cli.ts`, `src/lifecycle.ts`, `src/report.ts`, `src/help.ts`, `README.md`, `skills/spyglass/SKILL.md`, `landing/docs/index.html`, `CHANGELOG.md`.
- **Failure cases & E2E tests (write first):**
  - `spyglass finish` encounters a failed `result`, `doctor` or `down` stage: stops at the failing stage, retains the step in `log.jsonl`, does not mark the report complete, and exits non-zero with the repair command.
- **Changes:**
  - Add `--work` to `status` (`src/lifecycle.ts`, `src/cli.ts`): compute the exact delta to completion for each claim, control and gate (missing behavior step, missing independent read after step X, missing visual inspection for viewport/artifact, missing `observed` text).
  - In `allocate` (`src/lifecycle.ts`), when creating a run with a plan, inspect existing runs in `stateRoot` with the same `source.hash` and `profileHash` (or accept `up --cite-gates-from RUN`). When an earlier run passed a planned gate with compatible bindings, pre-fill `gates[].run` and `gates[].steps` in `result.json` and note the citation in `up` / `status`.
  - Add `spyglass finish [--file PATH] [--cleanup CHECK]` in `src/cli.ts`: sequentially runs and records `result`, `doctor`, `down` (and optional cleanup check), and `report` under the run lock, stopping at the first failed stage with its repair hint.
- **Acceptance checks:** `npm test` and `npm run format:check` pass.

### Slice 6: Fastpath, warm start and parallel checks

- **Files:** `docs/failure-cases.md`, `tests/e2e/core.test.mjs`, `tests/e2e/surfaces.test.mjs`, `src/cli.ts`, `src/state.ts`, `src/lifecycle.ts`, `src/checks.ts`, `src/browser.ts`, `src/help.ts`, `README.md`, `skills/spyglass/SKILL.md`, `landing/docs/index.html`, `CHANGELOG.md`.
- **Failure cases & E2E tests (write first):**
  - A source file is modified between commands while its size or timestamp is checked by the fast source check: `assertSource` detects the change immediately and refuses the command with `STALE_SOURCE`; `doctor` and `report` still verify full content hashes.
  - `check a,b` runs two checks in parallel and one fails: both steps and their artifacts are retained in `log.jsonl` without corrupting `run.json` or the log; the command exits 1 and names the failed check.
- **Changes:**
  - Call `module.enableCompileCache?.()` at the top of `src/cli.ts`.
  - Optimize `sourceChanges(run)` in `src/state.ts` for driving commands (`check`, `exec`, `api`, `db`): cache file `(mtimeMs, size, mode)` in `runHome(run)` at `up` and only SHA-256 re-hash files whose stat or `git status --porcelain -z` / `HEAD` changed; keep unconditional full SHA-256 hashing in `up`, `doctor` and `report`.
  - Run independent probes in `doctor` (`src/lifecycle.ts`) in parallel with `Promise.all`, and add `up --warm [--seat SEAT]` to start the exact-origin browser proxy and warm the seat browser session in parallel with app readiness.
  - Allow `spyglass check a,b` or `spyglass check --gates [--concurrency N]` (`src/checks.ts`, `src/cli.ts`) to run multiple checks concurrently under the parent CLI's run lock, writing each finished `Step` serially to `log.jsonl`.
  - Add `--relogin` on `ui` (or profile `reloginOnExpire`) to run seat login as a recorded sub-attempt when `BROWSER_EXPIRED` occurs.
- **Acceptance checks:** `npm test`, `node bench/overhead.mjs` (p50 <= 120 ms, p95 <= 150 ms, cold start <= 100 ms), and `npm run format:check` pass.

### Slice 7: `replay --from RUN`, bounded observations and exact `Fault` repair commands

- **Files:** `tests/e2e/core.test.mjs`, `src/cli.ts`, `src/browser.ts`, `src/surfaces.ts`, `src/errors.ts`, `src/help.ts`, `README.md`, `skills/spyglass/SKILL.md`, `landing/docs/index.html`, `CHANGELOG.md`.
- **Changes:**
  - Add a compact `observation` summary (`url`, `title`, `focused`, `consoleErrors`, `failedRequests`, `interactiveCount`, `changedLines`, `artifacts`) to `ui verify`, `ui proof` and `ui snapshot` output while keeping full snapshots in the retained artifact.
  - Add `spyglass replay --from OLD_RUN [--failed-only]` to list or re-run non-administrative steps cited by failed claims or controls in `OLD_RUN` and link `failedRun: OLD_RUN` on matching controls.
  - Audit all `new Fault(...)` calls across `src/` so `next` includes the concrete `--run <id>` and flags from the active context.
- **Acceptance checks:** `npm test`, `node bench/journey.mjs`, and `npm run format:check` pass.

### Slice 8: Local server (`spyglass serve`, conditional)

- **Condition:** Build **only** if Slice 6 still misses the Tier 2 p95 overhead gate (150 ms). If Slice 6 meets the p50 and p95 targets, skip Slice 8 and record the benchmark evidence in `docs/verification-speed.md`.

## 8. Failure cases to add first

These cases do not exist in [failure-cases.md](failure-cases.md) today. Each
new command or option in section 5 needs at least one.

| Area     | Failure case                                                                                                                                                       | Required result                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser  | A `ui verify` batch action passes, but a later expectation in the same call fails.                                                                                 | The step fails at that expectation, captures failure evidence, and keeps the passed actions and the failed assertion in the step record. The exit status is 1.        |
| Browser  | A `ui verify` batch action targets an origin outside the allowlist.                                                                                                | The call fails with `BROWSER_ORIGIN_BLOCKED` before or on that action. The record keeps the actions that ran.                                                         |
| Browser  | A `ui expect` or `ui verify` expectation passes only after the deadline, or never passes.                                                                          | The call fails with exit status 1 and records the last observation and elapsed time.                                                                                  |
| Browser  | `ui verify --expect-focus-moved LABEL` sees focus already on `LABEL` before the action, or on another element after.                                               | The call fails with `BROWSER_EXPECTATION_FAILED` and retains both `before` and `after` focus records in `focused.json`.                                               |
| Browser  | A `ui find` selector matches no element.                                                                                                                           | The command fails with exit status 1 and includes the nearest accessible roles and labels from the current page in its error data and retained snapshot.              |
| Browser  | `ui verify --proof` is called with multiple `--viewport` values and one viewport fails an expectation.                                                             | The step fails, retains the screenshots captured up to the failure, and does not mark the visual claim passed.                                                        |
| HTTP     | `api --wait-until` times out while the job remains `pending` (or reaches a `--fail-on` state).                                                                     | The command exits 1 with `API_EXPECTATION_FAILED`, retains the poll count and final response artifact, and cannot satisfy an `independentRead`.                       |
| HTTP     | `api --expect-json` sees a different field value or missing path despite HTTP 200.                                                                                 | The command exits 1, records the failed assertion on the step, and retains the masked response.                                                                       |
| Database | `db --expect-col` sees a different column value despite a matching row count.                                                                                      | The command exits 1 with `DATABASE_EXPECTATION_FAILED` and retains the bounded query result.                                                                          |
| Logs     | `logs --since-step` names an unknown step ID, or `--forbid-text` matches a log line.                                                                               | Unknown step fails with `UNKNOWN_STEP`; matched forbidden text fails with exit status 1 and retains the log artifact.                                                 |
| Claim    | A step run with `--claim ID` fails, and no later step for `ID` passes.                                                                                             | The pending result keeps the step reference or leaves the claim `not run`, and `result` rejects a `passed` outcome for `ID` with `FAILED_STEP`.                       |
| Claim    | A batch step cites an expectation that did not run.                                                                                                                | The claim cannot pass. The result names the missing expectation.                                                                                                      |
| Result   | `result` or `result --check` inspects a result file with multiple independent errors (for example, a missing step on claim A and a missing inspection on claim B). | Both `result` and `result --check` report all findings together in `data.findings` with the same rules and messages; `--check` does not record the result on the run. |
| Source   | A source file is modified between commands while its size or timestamp is checked by the fast source check.                                                        | `assertSource` detects the change immediately and refuses the command with `STALE_SOURCE`; `doctor` and `report` still verify full content hashes.                    |
| Check    | `check a,b` runs two checks in parallel and one fails.                                                                                                             | Both steps and their artifacts are retained in `log.jsonl` without corrupting `run.json` or the log; the command exits 1 and names the failed check.                  |
| Finish   | `spyglass finish` encounters a failed `result`, `doctor` or `down` step.                                                                                           | It stops at the failing stage, retains the step in `log.jsonl`, does not mark the report complete, and exits non-zero with the repair command.                        |

## 9. Open questions

1. **Batch granularity vs. diagnosis.** `ui verify` saves turns, while very
   long batches can make it harder for an agent to see which intermediate UI
   state changed when a product defect occurs. Keep batches scoped to **one
   claim** (typically 2 to 6 actions plus expectations and a proof), and auto-capture
   a failure screenshot + delta snapshot when any step in `ui verify` fails.
   Validate with Tier 1 and Tier 3 results.
2. **Pre-populating `result.json` vs. operator judgement.** `--claim ID` on a
   step can safely populate `steps`, `artifacts`, `independentRead` (when
   flagged) and viewport screenshot paths, because those are mechanical facts
   from the run record. Must `observed` and visual `inspections[].observed`
   stay blank until the operator writes them? **Yes** — the result rules require
   the operator to state what was observed and to inspect actual screenshots;
   the CLI must never fabricate an observation string.
3. **Idle browser timeout vs. warm relogin.** The default idle timeout is 1 hour
   (`BROWSER_IDLE_TIMEOUT_MS`). Measure whether automatic `--relogin` on
   `BROWSER_EXPIRED` allows a shorter default idle timeout (such as 10–15
   minutes) so background Chromium instances use less memory during long gate
   runs.
4. **Local server (`spyglass serve`).** Node 24's built-in
   `module.enableCompileCache()` plus `ui verify` batching may bring both p50
   and p95 well below the budget without a background daemon. Do not build
   `spyglass serve` unless Slice 6 still misses the p95 gate.
5. **Honest claim.** In the second baseline pair, Spyglass was 3.7 minutes slower in
   wall time (25.6 min vs 21.9 min, of which 2.7 min was a failed-then-retried
   gate and the rest was 72 shell calls + 6 `result` rejections).
   This plan targets fewer operator steps, zero `result` rejections and equal
   proof first, then lower wall time. Keep both numbers in every comparison
   report.

## 10. References

- [browser-benchmark.md](browser-benchmark.md): the 150 ms budget and its
  method.
- [failure-cases.md](failure-cases.md): the failures the CLI must detect.
- [ARCHITECTURE.md](../ARCHITECTURE.md): where each module lives.
- [agent_docs/testing.md](../agent_docs/testing.md): how to add and run an
  end-to-end test.
- [agent_docs/delivery.md](../agent_docs/delivery.md): the checks before a
  push, and the rules for a user-visible change.
