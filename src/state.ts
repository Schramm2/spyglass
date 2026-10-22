import {
  appendFileSync,
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
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
export function stateRoot(repo: string): string {
  return join(
    process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
    "spyglass",
    hash(repo).slice(0, 20),
  );
}
export function runFile(repo: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(id) || id.includes(".."))
    throw new Fault(
      "INVALID_RUN",
      "Invalid run name.",
      "Use letters, digits, hyphens and underscores.",
    );
  return join(stateRoot(repo), id, "run.json");
}
export function saveRun(run: Run): void {
  writeJson(runFile(run.repo, run.id), run);
}
export function runs(repo: string): Run[] {
  const root = stateRoot(repo);
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((id) => {
    try {
      return [readJson(runFile(repo, id)) as Run];
    } catch {
      return [];
    }
  });
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
  return readJson(file) as Run;
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
  const path = join(dirname(runFile(run.repo, run.id)), "lock", "owner.json");
  return existsSync(path) ? readJson(path) : null;
}
export function lock(run: Run, command: string): () => void {
  const path = join(dirname(runFile(run.repo, run.id)), "lock");
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
export class Context {
  vault: Secrets;
  step: Step;
  run: Run;
  constructor(run: Run, command: string, args: string[]) {
    this.run = run;
    this.vault = new Secrets(run.repo);
    this.vault.collect(run.profile);
    this.step = {
      run: run.id,
      profileHash: run.profileHash,
      tool: { name: "spyglass", version: "0.1.0", node: process.version },
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
      cwd: this.run.repo,
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
    const file = safePath(join(this.run.evidence, "spyglass"), "log.jsonl");
    appendFileSync(file, JSON.stringify(this.vault.clean(this.step)) + "\n", {
      mode: 0o600,
    });
    saveRun(this.run);
  }
}
