# M2 web adoption: Polka

## Outcome

**Passed, with stated limits.** The final run `m2-web-safe` has two passed behavior claims, one passed control, a passed repository gate, successful owner cleanup, and a complete offline report. A new shell reopened the report after cleanup. This is an agent adoption attempt, not a human usability study.

Open `run/spyglass/f43811af-7f8-1-index.html`. The earlier finish report is `run/spyglass/78f48b4c-343-1-index.html`. Both files are unchanged copies from Spyglass. The final response is `safe-reopened-report-corrected.json`.

## Source and tools

- Public target: <https://github.com/lukeed/polka>, shallow clone of its default branch.
- Exact target commit: `c36cf8b5d1a57164e64fdd7d4e0d0f80ab262dc0`.
- Existing app: `examples/with-sirv`; existing fault target: `examples/with-morgan`.
- Existing gate: root `npm run test`, including `pretest` / `lerna bootstrap`.
- Final source identity: `a2456d92700a4d8f3f906f4e05e194219dd7e9900fce4fc7c3d76193423850b3`. The report found no changes from its baseline.
- Spyglass source commit at initial packing: `e8bf2130637c3bc2284b89986a862abfe6f198e9`. No tracked changes were present at that time. One unrelated untracked drawing was present. The operator did not change the source checkout. Other agents changed that checkout later; this attempt continued from the initial packed source.
- Spyglass: `1.3.1`; Node: `v24.11.1`; npm: `11.6.2`; Git: `2.56.0`; agent-browser: `0.38.2`; Yarn: `1.22.22`.
- Target packages: checked-out Polka `0.5.2`, Sirv `3.0.2`, Morgan `1.12.1`, Lerna `2.11.0`, Tape `4.17.0`.
- Machine: macOS `27.0.1`, build `26A434`, Darwin arm64. curl `8.7.1`.
- Operator: `gpt-6.1-sol`, OpenAI, medium reasoning, Pi. No subagents.

The initial source tarball and the verified rebuilt tarball have the same SHA-256:

`2fd60ea57c6e96a50cd2988c144c5edb42913e73ad04e6cef816ad65307b8d1f`

The installed CLI SHA-256 is:

`896d88f6a542d378e8144dc4cd30682035f2b038057c1b17fa2dcd970146fad2`

The rebuild used the initially packed source, not later checkout edits. npm excludes `package-lock.json` from a package tarball. The operator copied the source lockfile into the temporary build folder, ran `npm ci`, ran `npm run build`, packed the result, and installed it with `npm install --prefix`. The verified build passed. The equal hashes show that the original build was already current; old file timestamps alone did not prove a stale build.

## Claims and control

1. **Health:** `GET /health --expect 200 --expect-body-contains OK` passes against Sirv.
2. **Local web page:** the browser opens `/`, checks title `Example: Sirv` and exactly one `#app`, and retains a 1280x800 screenshot. `GET /style.css` returns 200 and contains `#app`.
3. **Wrong-owner control:** the owner stops Sirv and starts the existing Morgan example on the same port. The identical health command returns 404 `Not Found` and fails assertion `body-contains OK`. The owner restores Sirv; the same command returns 200 `OK` and passes the same assertion.

Final control steps: failed `f21d224f-938`, restored `7d75a9e5-546`. The repository gate step is `a4ec293e-cd6`; all 343 assertions passed after the compatibility repair below. Its retained output is in `run/spyglass/`.

## Lifecycle authority

The profile uses `launch.mode: external`. The operator starts each existing example with its own `npm start`, with `PORT=43187`. Spyglass does not start or stop that server as an owned process. The operator records the listener PID, checks readiness with curl, and supplies a named `cleanup: true` check to stop that PID and confirm the endpoint is unavailable. `finish --cleanup owner-cleanup` records result, doctor, owner cleanup, down, and report.

This is **partial owner lifecycle adoption**. The repository supplies launch but has no native readiness or stop command. The profile records the operator-supplied checks. No new lifecycle helper file was added. The existing server binds to all interfaces; this attempt did not change its bind behavior. Final listener checks found no process on port 43187.

## Failures, repairs, and help gaps

| Observation | Repair and evidence | Assessment / proposed improvement |
| --- | --- | --- |
| `init` discovered only the root test command and guessed lifecycle `none`. | Reviewed the example README and source; set external lifecycle, web/API origin, readiness, owner doctor, guest seat and cleanup. `init.txt` retains the proposal and provenance. | Safe discovery, but manual example selection and lifecycle setup remained necessary. Suggest listing discovered runnable examples without selecting one automatically. |
| The first isolated rebuild failed: the package tarball had no lockfile, then `tsc` was absent. The operator initially missed those failures because the shell block did not stop. | Kept the failed build log locally. Later copied the source lockfile, used `set -e`, and verified `npm ci`, build, pack and prefix installation. | Operator error, corrected. A source-package build recipe should state that npm omits the lockfile. A package `files` allowlist and a verified pack build would also reduce retained package content. |
| Root bootstrap failed with `spawn yarn ENOENT`. | Installed Yarn only in a temporary prefix, then ran the unchanged repository bootstrap. | Repository setup dependency, not a Spyglass failure. |
| `${port}` resolved to an allocated port rather than the profile binding value `43187`; the first `up` failed `OWNER_DOCTOR_FAILED`. | Read the retained resolved profile. Changed the binding name to `ownerPort`. Kept and closed the failed run before the profile change. | The public help did not explain this reserved-name precedence. Suggest rejecting the collision or documenting reserved bindings. |
| The repository suite had 342 passes and one failure: `/Cannot read property/` did not match Node 24's `Cannot read properties ...`. | Changed only the existing no-input assertion to require `TypeError`. Started a new run on that final source. `final-target.diff` records this change. No test file, helper or fixture was added. | The contract remains rejection of missing input; dependence on engine message wording was removed. No extra mutation control was added for this compatibility repair; the plan states this limit. |
| `ui verify ... --seat guest` failed `BROWSER_USAGE`. | Moved `--seat guest` before `verify`, as the JSON UI help usage shows. Retained the failed step locally. | Help exposed the position rule, but mixed command/global flag placement was easy to get wrong. Suggest accepting the seat flag after the subcommand or giving an exact repaired command with the seat. |
| The first plan used assertion ID `body contains OK`; result validation rejected the control. Actual API output uses `body-contains OK`. | Read the failed and restored response assertions. Corrected the fixed plan and started a new run. | Operator guessed an assertion ID. Suggest an assertion-ID reference or a plan example that uses this API assertion. |
| One console error and one failed external request remained on the page. | Retained them and limited the browser claim to title, DOM presence and local stylesheet. | Expected origin-policy limit. No claim of a visible or working image gallery. |
| Lead requested removal of a personal PATH from the final evidence. | Created a temporary tool-bin with command symlinks, used only temporary and standard paths in the profile, and reran the complete proof in `m2-web-safe`. | Lead assistance. Earlier evidence stayed local and unchanged. |
| A clean-shell attempt with `HOME=/tmp` returned `UNKNOWN_RUN`. | Reopened in a new shell with the same HOME and no selected-run environment variable. Status and report passed with the app stopped. | Run lookup depends on the user's registry. This proves a new shell for the same user, not relocation to another HOME. Offline HTML itself is retained. |
| Initial privacy scan treated public route paths as personal home-directory paths. | Used case-sensitive home-path matching and a separate exact identity check. Final byte scan found no personal path matches. | Scanner false positive; no evidence bytes were edited. |

## Timings

All times are UTC on 2026-11-04. Intervals include the agent's reading and decisions, not only process execution. Tool steps retain their own durations.

| Phase | Start–end | Elapsed |
| --- | --- | --- |
| Instructions, public clone, initial pack/install, discovery | 13:38:05–13:39:42 | 1m37s |
| Example review, target install, owner setup, first `up` | 13:39:42–13:43:17 | 3m35s |
| Reserved-binding diagnosis and failed-run cleanup/report | 13:43:17–13:44:40 | 1m23s |
| Gate, control, browser and assertion-ID diagnosis | 13:44:40–13:46:41 | 2m01s |
| Existing-check repair, complete proof and first new-shell reopen | 13:46:41–13:48:32 | 1m51s |
| Lead privacy assistance, verified build and portable rerun preparation | 13:48:32–13:50:45 | 2m13s |
| Final proof: up, doctor, baseline, gate, fault, restore, browser, CSS | 13:50:45–13:50:48 | 3s |
| Final result, cleanup and complete report | 13:51:07–13:51:08 | 1s |
| Final new-shell attempt, registry diagnosis and corrected reopen | 13:51:38–13:52:52 | 1m14s |

Time to the final successful new-shell reopen: **14m47s** from session start. Evidence packaging and this report followed. Target installation took 33s; the Yarn repair took 3s; the verified Spyglass rebuild/pack/install took 5s. The final repository gate took 437ms. Final shell logs preserve exact command order and timestamps.

## Commands, assistance, and retention

- Exact final proof commands: `safe-proof.txt`, `safe-finish-commands.txt`, and `safe-reopen-corrected.txt`. The finish command log is an excerpt that ends before a privacy-scan command containing identity search terms; its full original stays local. This excerpt is not a Spyglass artifact. All Spyglass run files remain byte-exact.
- Final reviewed profile, fixed plan, and dependency locks: `adoption/`.
- Source repair: `final-target.diff`.
- Final offline artifacts and step log: `run/spyglass/`. Report and artifact bytes were not sanitized or edited after production.
- `checksums.json` records each retained file's SHA-256, except itself.
- The full local workspace is `/tmp/spyglass-m2-polka.dtXryw`. Its `operator-tool-calls.jsonl` records the exact tool calls, file reads, edits and shell commands for this attempt. Setup/build/error logs and all earlier runs remain there. That local history contains machine paths and is **not** part of this public-safe folder.
- Earlier runs retained locally: `m2-web` (failed owner doctor); `m2-web-restored` (gate and control-plan problems); `m2-web-final` (complete, but profile PATH needed privacy repair).
- Assistance: the user's initial repository suggestion; installed Spyglass and Herdr skills; repository instructions and public README/quickstart/schema/help; one lead message requiring portable PATH and byte-exact safe retention. No subagents, no requested diagnosis from another operator, no question or blocker escalation, no prior comparison worked solutions read.
- No npm publication, global installation, private repository access, credential access, push, or commit. npm and Yarn used public package registries. Only the temporary target checkout was edited.

## Limits

This proves local HTTP readiness, static page metadata and DOM presence, stylesheet delivery, wrong-example detection, the existing repaired repository suite, cleanup, and an offline report that can be read in a new shell for the same user. It does not prove visual quality, image completion, all application routes, login, data persistence, database behavior, mobile behavior, or human usability. The control changes the deployed example, not application code. Legacy dependency audit findings remain: the root install reported 42 vulnerabilities. This folder is evidence, not an installed runtime distribution; tool-bin symlinks and the original user run registry are not included.
