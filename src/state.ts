import {
  appendFileSync,
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Plan, Profile, Result } from "./schema.js";
import { Fault } from "./errors.js";
import {
  beneath,
  hash,
  readJson,
  regular,
  safePath,
  writeJson,
} from "./files.js";
import { Secrets } from "./secrets.js";
import { runCommand } from "./process.js";
import type { ProcessOptions, ProcessResult } from "./process.js";
export interface Source {
  commit: string;
  hash: string;
  files: Record<string, string>;
}
export interface Artifact {
  path: string;
  sha256: string;
  kind: string;
  step: string;
}
/**
 * What a driving command links its step to in the pending result file. Only
 * mechanical facts move: step IDs, artifact paths and the later read. The
 * operator still writes every observation and every claim outcome.
 */
export interface StepLinks {
  claims: string[];
  independentRead: boolean;
  controls: { id: string; state: "failed" | "restored" }[];
  gates: string[];
  /** For `evidence add`: the step that the evidence belongs to. */
  evidenceFor?: string;
}
export interface LinkSummary {
  claims: string[];
  controls: string[];
  gates: string[];
  skipped: string[];
  error?: string;
}
export interface Step {
  run: string;
  profileHash: string;
  tool: { name: string; version: string; node: string };
  id: string;
  command: string;
  args: string[];
  exitCode: number;
  commandExitCode?: number;
  status?: "passed" | "failed";
  startedAt: string;
  durationMs: number;
  source: Source;
  artifacts: Artifact[];
  data: Record<string, unknown>;
}
/** agent-browser's own default, used when a profile sets no browser block. */
export const BROWSER_IDLE_TIMEOUT_MS = 60 * 60_000;
export interface Run {
  id: string;
  repo: string;
  state: "starting" | "ready" | "failed" | "stopped";
  evidence: string;
  profile: Profile;
  profilePath: string;
  profileHash: string;
  /** CLI binding overrides as given, before templates; absent in runs from 1.0.0. */
  bindingOverrides?: Record<string, string>;
  /** The profile as hashed, before templates; absent in runs from 1.1.0 and earlier. */
  rawProfile?: Profile;
  source: Source;
  port: number;
  web?: string;
  api?: string;
  plan: Plan;
  result?: Result;
  resultPath: string;
  createdAt: string;
  process?: { pid: number; identity: string };
  browserProxy?: {
    pid: number;
    identity: string;
    port: number;
    origins: string[];
    instance: string;
    sequence: number;
  };
  sessions: Record<string, string>;
  /** Last agent-browser call per seat; each call resets the daemon's idle timer. */
  browserUsedAt?: Record<string, string>;
  activeSeat: string;
  marks: Record<string, string>;
  ownerCleaned: boolean;
  cleanup: boolean;
  lastDoctor?: string;
}
function stateDirectory(key: string): string {
  return join(
    process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
    "spyglass",
    hash(key).slice(0, 20),
  );
}
/**
 * The main worktree path, shared by every linked worktree of the repository,
 * so a control's failed run in a fault worktree is visible to its candidate.
 * Read from the files Git writes, not a git process: `ui` has a time budget.
 */
function sharedRepository(repo: string): string {
  const dotGit = join(repo, ".git");
  try {
    if (!lstatSync(dotGit).isFile()) return repo;
    const gitDir = resolve(
      repo,
      readFileSync(dotGit, "utf8")
        .replace(/^gitdir:\s*/, "")
        .trim(),
    );
    // A main worktree with a separate Git directory has no commondir file.
    const commonDir = join(gitDir, "commondir");
    const common = realpathSync(
      existsSync(commonDir)
        ? resolve(gitDir, readFileSync(commonDir, "utf8").trim())
        : gitDir,
    );
    return basename(common) === ".git" ? dirname(common) : common;
  } catch {
    return repo;
  }
}
/** Runs of the whole repository; one directory per run. */
function stateRoot(repo: string): string {
  return stateDirectory(sharedRepository(repo));
}
/**
 * Before runs were shared, each linked worktree kept its runs under its own
 * path. Such a run stays there and is found first from its own worktree, so
 * a shared run with the same ID never hides it from cleanup.
 */
function legacyStateRoot(repo: string): string | undefined {
  return sharedRepository(repo) === repo ? undefined : stateDirectory(repo);
}
export function runDirectory(repo: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(id) || id.includes(".."))
    throw new Fault(
      "INVALID_RUN",
      "Invalid run name.",
      "Use letters, digits, hyphens and underscores.",
    );
  const legacy = legacyStateRoot(repo);
  return legacy && existsSync(join(legacy, id))
    ? join(legacy, id)
    : join(stateRoot(repo), id);
}
export function runFile(repo: string, id: string): string {
  return join(runDirectory(repo, id), "run.json");
}
/**
 * The directory each run was read from. A run's own worktree may be gone, so
 * its path can no longer locate the shared store; the reader's path can.
 */
const runHomes = new WeakMap<Run, string>();
function readRun(directory: string): Run {
  const run = readJson(join(directory, "run.json")) as Run;
  runHomes.set(run, directory);
  return run;
}
export function runHome(run: Run): string {
  return runHomes.get(run) ?? runDirectory(run.repo, run.id);
}
export function saveRun(run: Run): void {
  writeJson(join(runHome(run), "run.json"), run);
}
export function runs(repo: string): Run[] {
  return [legacyStateRoot(repo), stateRoot(repo)].flatMap((root) =>
    root && existsSync(root)
      ? readdirSync(root).flatMap((id) => {
          try {
            return [readRun(join(root, id))];
          } catch {
            return [];
          }
        })
      : [],
  );
}
export function loadRun(repo: string, id: string): Run {
  const file = runFile(repo, id);
  if (!existsSync(file))
    throw new Fault(
      "UNKNOWN_RUN",
      `Unknown run ${id}. Existing runs: ${
        runs(repo)
          .map((r) => r.id)
          .join(", ") || "none"
      }.`,
      "Run spyglass status or spyglass up.",
    );
  return readRun(dirname(file));
}
/**
 * Runs are shared across worktrees for reading; only the run's own worktree
 * drives it. A run whose worktree was removed can still be stopped anywhere.
 */
export function worktreeRemoved(run: Run): boolean {
  return !existsSync(run.repo);
}
export function assertWorktree(run: Run, repo: string, command: string): void {
  if (run.repo === repo || (command === "down" && worktreeRemoved(run))) return;
  if (worktreeRemoved(run))
    throw new Fault(
      "RUN_OTHER_WORKTREE",
      `Run ${run.id} belongs to the removed worktree ${run.repo}.`,
      `Run spyglass down --run ${run.id} to stop what remains of it.`,
    );
  throw new Fault(
    "RUN_OTHER_WORKTREE",
    `Run ${run.id} belongs to the worktree ${run.repo}.`,
    `Run this command from ${run.repo}. Run down there before you remove that worktree.`,
  );
}
export function source(repo: string, profile: Profile): Source {
  const r = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repo, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (r.status !== 0)
    throw new Fault(
      "SOURCE_READ",
      "Cannot list repository source.",
      "Check Git working tree permissions.",
      3,
    );
  const names = new Set(r.stdout.split("\0").filter(Boolean));
  const index = spawnSync("git", ["ls-files", "--stage", "-z"], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (index.status !== 0)
    throw new Fault(
      "SOURCE_READ",
      "Cannot read Git source index.",
      "Check Git working tree permissions.",
      3,
    );
  const submodules = new Set(
    index.stdout
      .split("\0")
      .filter((row) => row.startsWith("160000 "))
      .map((row) => row.slice(row.indexOf("\t") + 1)),
  );
  for (const pattern of profile.source?.include ?? [])
    for (const p of globSync(pattern, { cwd: repo })) names.add(p);
  const files: Record<string, string> = {};
  for (const name of [...names].sort()) {
    const p = resolve(repo, name);
    if (!beneath(repo, p))
      throw new Fault(
        "SOURCE_PATH",
        `Source input outside repository: ${name}.`,
        "Keep source.include within the repository.",
      );
    try {
      if (submodules.has(name)) {
        if (!existsSync(join(p, ".git")))
          throw new Fault(
            "SUBMODULE_UNAVAILABLE",
            `Submodule ${name} is not initialized.`,
            "Initialize the required submodule before verification.",
            3,
          );
        const nested = source(p, { ...profile, source: { include: [] } });
        files[name] = hash(JSON.stringify(nested));
        continue;
      }
      const s = lstatSync(p);
      if (s.isSymbolicLink()) files[name] = hash(`link:${readlinkSync(p)}`);
      else if (s.isFile()) files[name] = hash(readFileSync(p));
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "ENOENT")
        files[name] = "missing";
      else if (e instanceof Fault) throw e;
      else
        throw new Fault(
          "SOURCE_READ",
          `Cannot read source input ${name}.`,
          "Restore readable source permissions and retry verification.",
          3,
        );
    }
  }
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).stdout.trim();
  return { commit, hash: hash(JSON.stringify(files)), files };
}
export function sourceChanges(run: Run): string[] {
  const now = source(run.repo, run.profile);
  return [
    ...(now.commit !== run.source.commit ? ["Git commit changed"] : []),
    ...[
      ...new Set([...Object.keys(now.files), ...Object.keys(run.source.files)]),
    ].filter((k) => now.files[k] !== run.source.files[k]),
  ];
}
export function assertSource(run: Run): void {
  const changes = sourceChanges(run);
  if (changes.length)
    throw new Fault(
      "STALE_SOURCE",
      `Source changed since up: ${changes.join(", ")}.`,
      "Rebuild through the owner and create a new run; keep the earlier evidence.",
      1,
      { changed: changes },
    );
}
export function ignored(repo: string, path: string): boolean {
  return (
    spawnSync("git", ["check-ignore", "-q", path], { cwd: repo }).status === 0
  );
}
export function steps(run: Run): Step[] {
  const file = join(run.evidence, "spyglass/log.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Step);
}
export function lockInfo(run: Run): unknown {
  const path = join(runHome(run), "lock", "owner.json");
  return existsSync(path) ? readJson(path) : null;
}
export function lock(run: Run, command: string): () => void {
  const path = join(runHome(run), "lock");
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
      throw new Fault(
        "LOCK_UNAVAILABLE",
        `Cannot create the run lock at ${path}.`,
        "Check state-directory permissions and grant access before retrying.",
        3,
      );
    throw new Fault(
      "RUN_BUSY",
      `Run ${run.id} is busy. Lock: ${path}.`,
      "Inspect spyglass status --run " +
        run.id +
        ". Wait for the active command; do not bypass its lock.",
      3,
    );
  }
  try {
    writeJson(join(path, "owner.json"), {
      pid: process.pid,
      processStartedAt: new Date(
        Date.now() - process.uptime() * 1000,
      ).toISOString(),
      command,
      startedAt: new Date().toISOString(),
    });
  } catch {
    rmSync(path, { recursive: true, force: true });
    throw new Fault(
      "LOCK_UNAVAILABLE",
      "Cannot record the run lock owner.",
      "Check state-directory permissions and available disk space before retrying.",
      3,
    );
  }
  return () => rmSync(path, { recursive: true, force: true });
}
export function blankClaim(
  claim: Plan["claims"][number],
): Result["claims"][number] {
  return {
    id: claim.id,
    outcome: "not run",
    steps: [],
    observed: "",
    artifacts: [],
    ...(claim.kind === "side-effect" ? { independentRead: "" } : {}),
    ...(claim.kind === "visual" ? { inspections: [] } : {}),
  };
}
function blankControl(run: Run, id: string): Result["controls"][number] {
  return {
    id,
    failedRun: run.id,
    failedStep: "",
    restoredStep: "",
    observedFailure: "",
    observedPass: "",
  };
}
function stepSucceeded(step: Step): boolean {
  return (
    step.status === "passed" &&
    step.exitCode === 0 &&
    !step.data?.error &&
    step.data?.passed !== false &&
    step.data?.timedOut !== true
  );
}
const addOnce = (list: string[], value: string) => {
  if (value && !list.includes(value)) list.push(value);
};
/**
 * Add a finished step to the pending result of the run. A failed step is never
 * cited by a claim, so a retry does not leave a failed assertion in it; the
 * failed step stays in the log. A problem with the file never fails the step.
 */
export function linkPendingResult(
  run: Run,
  step: Step,
  links: StepLinks,
): LinkSummary {
  const summary: LinkSummary = {
    claims: [],
    controls: [],
    gates: [],
    skipped: [],
  };
  let pending: Result;
  try {
    pending = readJson(run.resultPath) as Result;
    if (!Array.isArray(pending.claims)) throw new Error("no claims array");
  } catch (error) {
    summary.error = `Cannot update the pending result ${run.resultPath}: ${error instanceof Error ? error.message : String(error)}`;
    return summary;
  }
  pending.controls ??= [];
  pending.gates ??= [];
  const passed = stepSucceeded(step);
  const paths = step.artifacts.map((artifact) => artifact.path);
  const claimRow = (id: string) => {
    let row = pending.claims.find((item) => item.id === id);
    if (!row) {
      row = blankClaim(run.plan.claims.find((item) => item.id === id)!);
      pending.claims.push(row);
    }
    return row;
  };
  const cite = (id: string) => {
    const row = claimRow(id);
    addOnce(row.steps, step.id);
    if (links.evidenceFor) addOnce(row.steps, links.evidenceFor);
    row.artifacts ??= [];
    for (const path of paths) addOnce(row.artifacts, path);
    return row;
  };
  for (const id of links.claims) {
    if (!passed) {
      summary.skipped.push(`claim ${id}: the step failed, so it is not cited`);
      continue;
    }
    const row = cite(id);
    if (links.independentRead) row.independentRead = step.id;
    // A visual claim gets one inspection per viewport that the step captured.
    // The viewport and the screenshot are facts of the run; what the image
    // shows stays for the operator to write.
    const shots = step.data?.viewports;
    if (
      run.plan.claims.find((item) => item.id === id)?.kind === "visual" &&
      Array.isArray(shots)
    ) {
      row.inspections ??= [];
      for (const shot of shots as { viewport?: string; artifact?: string }[])
        if (
          shot.viewport &&
          shot.artifact &&
          !row.inspections.some((item) => item.artifact === shot.artifact)
        )
          row.inspections.push({
            viewport: shot.viewport,
            expected: "",
            observed: "",
            artifact: shot.artifact,
          });
    }
    summary.claims.push(id);
  }
  for (const { id, state } of links.controls) {
    let row = pending.controls.find((item) => item.id === id);
    if (!row) pending.controls.push((row = blankControl(run, id)));
    if (state === "failed") {
      row.failedStep = step.id;
      summary.controls.push(`${id}:failed`);
    } else if (passed) {
      row.restoredStep = step.id;
      // The control's own claim must cite the restored pass.
      const spec = run.plan.controls.find((item) => item.id === id);
      if (spec && run.plan.claims.some((item) => item.id === spec.claim))
        cite(spec.claim);
      summary.controls.push(`${id}:restored`);
    } else
      summary.skipped.push(
        `control ${id}: the restored step failed, so it is not linked`,
      );
  }
  for (const name of links.gates) {
    let row = pending.gates.find((item) => item.name === name);
    if (!row)
      pending.gates.push((row = { name, outcome: "not run", steps: [] }));
    row.outcome = passed ? "passed" : "failed";
    if (passed) addOnce(row.steps, step.id);
    summary.gates.push(`${name}:${row.outcome}`);
  }
  try {
    writeJson(run.resultPath, pending);
  } catch (error) {
    summary.error = `Cannot write the pending result: ${error instanceof Error ? error.message : String(error)}`;
  }
  return summary;
}
export class Context {
  vault: Secrets;
  step: Step;
  run: Run;
  links?: StepLinks;
  linked?: LinkSummary;
  constructor(run: Run, command: string, args: string[]) {
    this.run = run;
    this.vault = new Secrets(run.repo);
    this.vault.collect(run.profile);
    this.step = {
      run: run.id,
      profileHash: run.profileHash,
      tool: { name: "spyglass", version: "1.2.0", node: process.version },
      id: randomUUID().slice(0, 12),
      command,
      args: this.vault.clean(args),
      exitCode: 0,
      commandExitCode: 0,
      status: "passed",
      startedAt: new Date().toISOString(),
      durationMs: 0,
      source: run.source,
      artifacts: [],
      data: {},
    };
  }
  artifact(name: string, content: unknown, kind = "text"): Artifact {
    const relativePath = `${this.step.id}-${this.step.artifacts.length + 1}-${basename(name).replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    const file = safePath(join(this.run.evidence, "spyglass"), relativePath);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const data = Buffer.isBuffer(content)
      ? content
      : typeof content === "string"
        ? this.vault.text(content)
        : JSON.stringify(this.vault.clean(content), null, 2) + "\n";
    writeFileSync(file, data, { mode: 0o600, flag: "wx" });
    const a = {
      path: relativePath,
      sha256: hash(readFileSync(file)),
      kind,
      step: this.step.id,
    };
    this.step.artifacts.push(a);
    return a;
  }
  importArtifact(file: string): Artifact {
    const p = resolve(this.run.repo, file);
    const roots = [
      this.run.evidence,
      ...this.run.profile.imports.map((x) => resolve(this.run.repo, x)),
    ];
    const root = roots.find((r) => beneath(r, p));
    if (!root)
      throw new Fault(
        "UNSAFE_ARTIFACT",
        `Artifact is outside allowed import roots: ${file}.`,
        "Declare a narrow imports root in the profile.",
      );
    safePath(root, p);
    if (!existsSync(p))
      throw new Fault(
        "MISSING_ARTIFACT",
        `Missing artifact ${file}.`,
        "Run its producing check again.",
        1,
      );
    regular(p);
    const before = readFileSync(p);
    const ext = p.split(".").at(-1)?.toLowerCase();
    let data: unknown;
    if (["png", "jpg", "jpeg"].includes(ext ?? "")) data = before;
    else if (
      ["json", "jsonl", "txt", "log", "md", "csv", "xml"].includes(ext ?? "")
    ) {
      data = ext === "json" ? readJson(p) : before.toString("utf8");
    } else
      throw new Fault(
        "UNSUPPORTED_ARTIFACT",
        `Unsupported artifact format: ${ext}.`,
        "Export safe JSON, text or a screenshot; inspect binary evidence at its source.",
      );
    const result = this.artifact(
      basename(p),
      data,
      ["png", "jpg", "jpeg"].includes(ext ?? "") ? "image" : "imported",
    );
    if (hash(readFileSync(p)) !== hash(before))
      throw new Fault(
        "ARTIFACT_CHANGED",
        "Artifact changed while importing.",
        "Wait for the producer to finish and retry.",
        1,
      );
    return result;
  }
  async execute(
    command: string[],
    options: ProcessOptions = {},
  ): Promise<ProcessResult> {
    return runCommand(command, {
      // A removed worktree cannot be a working folder; down still runs.
      cwd: worktreeRemoved(this.run) ? runHome(this.run) : this.run.repo,
      env: process.env,
      ...options,
    });
  }
  finish(
    exitCode: number,
    data: Record<string, unknown>,
    commandExitCode = exitCode,
  ): void {
    this.step.exitCode = exitCode;
    this.step.commandExitCode = commandExitCode;
    this.step.status = commandExitCode === 0 ? "passed" : "failed";
    this.step.durationMs = Date.now() - Date.parse(this.step.startedAt);
    this.step.data = this.vault.clean(data);
    this.step.args = this.vault.clean(this.step.args);
    // A removed worktree took the pending result with it.
    if (this.links && !worktreeRemoved(this.run)) {
      this.linked = linkPendingResult(this.run, this.step, this.links);
      this.step.data = { ...this.step.data, linked: this.linked };
    }
    // A removed worktree took the log with it; never recreate its folders.
    if (!worktreeRemoved(this.run)) {
      const file = safePath(join(this.run.evidence, "spyglass"), "log.jsonl");
      appendFileSync(file, JSON.stringify(this.vault.clean(this.step)) + "\n", {
        mode: 0o600,
      });
    }
    saveRun(this.run);
  }
}
