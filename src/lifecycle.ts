import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Fault, fault } from "./errors.js";
import { hash, readJson, safePath, writeJson } from "./files.js";
import { loadProfile, locateProfile, template } from "./profile.js";
import { planSchema, profileSchema, validate } from "./schema.js";
import {
  Context,
  assertSource,
  blankClaim,
  ignored,
  lockInfo,
  runDirectory,
  runFile,
  worktreeRemoved,
  saveRun,
  source,
  sourceChanges,
  steps,
} from "./state.js";
import type { Run } from "./state.js";
import {
  isSameProcess,
  processIdentity,
  processGroupMembers,
} from "./process.js";
export interface UpOptions {
  id?: string;
  profile?: string;
  plan?: string;
  bindings: Record<string, string>;
  cmd?: string;
  ready?: string;
}
async function freePort(): Promise<number> {
  return await new Promise((ok, no) => {
    const s = createServer();
    s.once("error", no);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close((e) => (e ? no(e) : ok(port)));
    });
  });
}
export async function allocate(repo: string, opts: UpOptions): Promise<Run> {
  const id =
    opts.id ?? `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  if (existsSync(runFile(repo, id)))
    throw new Fault(
      "RUN_EXISTS",
      `Run ${id} already exists.`,
      "Select another run name; existing evidence is retained.",
    );
  const profilePath = opts.cmd
    ? "direct command"
    : locateProfile(repo, opts.profile);
  const raw = opts.cmd
    ? validate(
        profileSchema,
        {
          version: 1,
          app: "direct",
          launch: {
            mode: "owned",
            command: ["/bin/sh", "-c", opts.cmd],
            ready: { url: opts.ready },
          },
          web: opts.ready,
        },
        "profile",
      )
    : loadProfile(profilePath);
  if (opts.cmd && !opts.ready)
    throw new Fault(
      "MISSING_READY",
      "Direct launch requires --ready.",
      'Use up --cmd "npm run dev" --ready http://127.0.0.1:3000.',
    );
  const port = await freePort();
  const vars: Record<string, string> = {
    ...raw.bindings,
    ...opts.bindings,
    repo,
    run: id,
    port: String(port),
  };
  for (let pass = 0; pass < 4; pass++)
    for (const [k, v] of Object.entries(vars)) {
      try {
        vars[k] = template(v, vars);
      } catch {}
    }
  if (raw.web) vars.web = template(raw.web, vars);
  if (raw.api) vars.api = template(raw.api, vars);
  vars.evidence = resolve(repo, template(raw.evidence, vars));
  const profile = template(
    { ...raw, bindings: { ...raw.bindings, ...opts.bindings } },
    vars,
  );
  const evidence = vars.evidence;
  if (!ignored(repo, evidence))
    throw new Fault(
      "EVIDENCE_NOT_IGNORED",
      `Evidence path must be ignored by Git: ${relative(repo, evidence)}.`,
      `Add ${relative(repo, evidence).split("/")[0]}/ to .gitignore before starting a run.`,
    );
  safePath(repo, evidence);
  const plan = opts.plan
    ? validate(planSchema, readJson(resolve(repo, opts.plan)), "plan")
    : validate(planSchema, { claims: [] }, "plan");
  const run: Run = {
    id,
    repo,
    state: "starting",
    evidence,
    profile,
    profilePath,
    profileHash: hash(JSON.stringify(raw)),
    rawProfile: raw,
    bindingOverrides: opts.bindings,
    source: source(repo, profile),
    port,
    web: profile.web,
    api: profile.api,
    plan,
    resultPath: join(evidence, "spyglass/result.json"),
    createdAt: new Date().toISOString(),
    sessions: {},
    activeSeat: "default",
    marks: {},
    ownerCleaned: profile.launch.mode !== "external",
    cleanup: false,
  };
  const directory = runDirectory(repo, id);
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  try {
    mkdirSync(directory, { mode: 0o700 });
  } catch {
    throw new Fault(
      "RUN_EXISTS",
      `Run ${id} is already allocated.`,
      "Choose a new run ID; existing run evidence is retained.",
    );
  }
  let claimed = false;
  try {
    mkdirSync(join(evidence, "spyglass"), { recursive: true, mode: 0o700 });
    try {
      writeFileSync(
        join(evidence, "spyglass/.owner.json"),
        JSON.stringify({ repo, id }),
        { flag: "wx", mode: 0o600 },
      );
      claimed = true;
    } catch {
      throw new Fault(
        "EVIDENCE_OWNED",
        `Evidence folder is already claimed: ${evidence}.`,
        "Use a distinct evidence folder for each run, such as .spyglass/runs/${run}.",
      );
    }
    writeJson(run.resultPath, {
      operator: "agent",
      controls: plan.controls.map(({ id }) => ({
        id,
        failedRun: run.id,
        failedStep: "",
        restoredStep: "",
        observedFailure: "",
        observedPass: "",
      })),
      claims: plan.claims.map(blankClaim),
      gates: plan.gates.map((name) => ({
        name,
        outcome: "not run",
        steps: [],
      })),
      limits: plan.limits,
    });
    saveRun(run);
    return run;
  } catch (e) {
    rmSync(directory, { recursive: true, force: true });
    if (claimed)
      rmSync(join(evidence, "spyglass/.owner.json"), { force: true });
    throw e;
  }
}
/** One unreadable worktree must not stop status for every run. */
function currentSource(run: Run): Record<string, unknown> {
  if (worktreeRemoved(run)) return { worktreeRemoved: true };
  try {
    return { sourceChanges: sourceChanges(run) };
  } catch (error) {
    return { sourceError: fault(error).message };
  }
}
export function status(run: Run): Record<string, unknown> {
  const records = steps(run);
  return {
    id: run.id,
    state: run.state,
    repo: run.repo,
    evidence: relative(run.repo, join(run.evidence, "spyglass")),
    web: run.web,
    api: run.api,
    port: run.port,
    source: {
      commit: run.source.commit,
      hash: run.source.hash,
      fileCount: Object.keys(run.source.files).length,
    },
    ...currentSource(run),
    profile: run.profilePath,
    plan: run.plan,
    result: relative(run.repo, run.resultPath),
    export: `export SPYGLASS_RUN=${run.id}`,
    active: lockInfo(run),
    activeSeat: run.activeSeat,
    cleanup: run.cleanup,
    capabilities: capabilities(run),
    completedChecks: records
      .filter((s) => s.command === "check")
      .map((s) => ({
        name: s.args[0],
        step: s.id,
        exitCode: s.exitCode,
        commandExitCode:
          s.commandExitCode ?? (s.data.passed === false ? 1 : s.exitCode),
        childExitCode: s.exitCode,
        spyglassExitCode:
          s.commandExitCode ?? (s.data.passed === false ? 1 : s.exitCode),
        status:
          s.status ??
          (s.data.passed === false || s.exitCode !== 0 ? "failed" : "passed"),
      })),
    pendingClaims: run.plan.claims
      .filter(
        (c) =>
          !run.result?.claims.some(
            (r) => r.id === c.id && r.outcome === "passed",
          ),
      )
      .map((c) => c.id),
    owner: {
      mode: run.profile.launch.mode,
      bindings: run.profile.bindings,
      cleanupRequired: !run.ownerCleaned,
    },
    next: nextCommand(run),
    // Last, so a long list never cuts the next command from text output.
    resultRules: resultRules(run),
  };
}
/**
 * The rules that `result` enforces for this plan, named by claim, control and
 * gate, so an operator fills the template once instead of learning each rule
 * from a refused submission.
 */
function resultRules(run: Run): string[] {
  const { claims, controls, gates } = run.plan;
  const ids = (kind: string) =>
    claims.filter((c) => c.kind === kind).map((c) => c.id);
  // A rule applies alike to each claim it names, so a long list stays short.
  const list = (names: string[]) =>
    names.length > 8
      ? `${names.slice(0, 8).join(", ")} and ${names.length - 8} more`
      : names.join(", ");
  const rules: string[] = [];
  if (claims.length)
    rules.push(
      "A passed claim lists its successful steps from this run in steps and states what you saw in observed.",
      "Copy each artifact path as a step returned it, relative to the evidence folder, and cite the step that made it.",
    );
  const byCheck = new Map<string, string[]>();
  for (const claim of claims)
    for (const name of claim.checks)
      if (run.profile.checks[name])
        byCheck.set(name, [...(byCheck.get(name) ?? []), claim.id]);
  for (const [name, cited] of byCheck)
    rules.push(
      `Claims ${list(cited)}: cite a successful step of check ${name}.`,
    );
  const behavior = ids("behavior");
  if (behavior.length)
    rules.push(
      `Behavior claims ${list(behavior)}: cite a successful behavior check and its non-image evidence; a screenshot alone proves no behavior.`,
    );
  const visual = ids("visual");
  if (visual.length)
    rules.push(
      `Visual claims ${list(visual)}: fill inspections with the viewport, expected, observed and a screenshot artifact from a cited step.`,
    );
  const sideEffect = ids("side-effect");
  if (sideEffect.length)
    rules.push(
      `Side-effect claims ${list(sideEffect)}: list the action step and a later read in steps, and set independentRead to the read's step ID. An api read is a GET with a 2xx status other than 202; a db read is a read-only query that is not truncated.`,
    );
  if (controls.length)
    rules.push(
      "Controls: set failedStep to the step that shows the declared failure, restoredStep to a later step of this run that passes the same assertion or command, and observedFailure and observedPass to what you saw. failedRun is this run, or an earlier run that is stopped with down, has its owner cleanup done, declares the same control and keeps its evidence. The control's claim passes and cites restoredStep.",
    );
  for (const control of controls) {
    // The same choice as the control check in report.ts.
    const declared =
      control.command && control.failure && !control.assertion
        ? `command ${control.command.join(" ")} fails with ${control.failure.code} containing "${control.failure.contains}"`
        : control.assertion && !control.command && !control.failure
          ? `assertion ${control.assertion}`
          : "cannot pass: the plan must declare either an assertion or a command with an expected failure";
    rules.push(`Control ${control.id}: claim ${control.claim}, ${declared}.`);
  }
  if (gates.length)
    rules.push(
      `Gates ${gates.join(", ")}: list successful steps. To cite another run, add run: it needs the same source and profile and its evidence kept, and a gate fails when its step used a binding with another value.`,
    );
  return rules;
}
function nextCommand(run: Run): string {
  if (run.plan.claims.length && !run.result)
    return `spyglass result --file ${relative(run.repo, run.resultPath)} --run ${run.id}`;
  return `spyglass ${run.cleanup ? "report" : "down"} --run ${run.id}`;
}
export function capabilities(run: Run): Record<string, unknown> {
  return {
    ui: {
      available: !!run.web,
      tool: "agent-browser",
      testedVersion: "0.38.2",
    },
    api: { available: !!run.api, tool: "Node fetch" },
    db: { available: !!run.profile.db, tool: "node-postgres" },
    compose: { available: !!run.profile.compose, tool: "docker compose" },
    check: {
      available: Object.keys(run.profile.checks).length > 0,
      names: Object.keys(run.profile.checks),
    },
    exec: { available: true, tool: "process" },
    skill: run.profile.skill ?? null,
    features: run.profile.features ?? null,
  };
}
async function ready(ctx: Context): Promise<void> {
  const { run } = ctx;
  const childRunning = () => {
    if (!run.process) return true;
    const path = join(run.evidence, "spyglass/app-state.json");
    if (!existsSync(path)) return false;
    const state = readJson(path) as { status: string; exitCode?: number };
    if (state.status === "exited" || state.status === "failed")
      throw new Fault(
        "APP_EXITED",
        "The owned launch child exited before readiness.",
        "Inspect the retained launch log, fix the command or port conflict, and create a new run.",
        3,
        { exitCode: state.exitCode ?? 1 },
      );
    return state.status === "running";
  };
  const definition = run.profile.launch.ready;
  if (!definition) return;
  const end = Date.now() + (definition.timeoutMs ?? 30000);
  let last = "No readiness check completed.";
  do {
    if (
      run.process &&
      processIdentity(run.process.pid) !== run.process.identity
    )
      throw new Fault(
        "APP_EXITED",
        "The owned app exited before readiness.",
        "Inspect the launch log and fix the launch command.",
        3,
      );
    if (!childRunning()) {
      await delay(30);
      continue;
    }
    if (definition.command) {
      const r = await ctx.execute(definition.command, {
        env: ctx.vault.environment(process.env, run.profile.launch.env),
        timeoutMs: Math.min(5000, Math.max(100, end - Date.now())),
      });
      last = ctx.vault.text(r.stderr || r.stdout);
      let structured: unknown;
      try {
        structured = JSON.parse(r.stdout);
      } catch {}
      const refused =
        structured &&
        typeof structured === "object" &&
        "ok" in structured &&
        structured.ok === false;
      if (r.exitCode === 0 && !refused) {
        await delay(30);
        if (childRunning()) return;
      }
    } else if (definition.url) {
      try {
        const response = await fetch(definition.url, {
          redirect: "manual",
          signal: AbortSignal.timeout(
            Math.min(2000, Math.max(1, end - Date.now())),
          ),
        });
        await response.body?.cancel();
        last = `HTTP ${response.status}`;
        if (response.status === (definition.status ?? 200)) {
          await delay(30);
          if (childRunning()) return;
        }
      } catch (e) {
        last = e instanceof Error ? e.message : String(e);
      }
    } else
      throw new Fault(
        "INVALID_READY",
        "Readiness needs url or command.",
        "Set launch.ready.url or launch.ready.command.",
      );
    await delay(60);
  } while (Date.now() < end);
  throw new Fault(
    "NOT_READY",
    `App readiness failed: ${last}`,
    "Inspect the launch log and correct readiness or the app.",
    3,
  );
}
export async function doctor(ctx: Context): Promise<Record<string, unknown>> {
  assertSource(ctx.run);
  if (!ignored(ctx.run.repo, ctx.run.evidence))
    throw new Fault(
      "EVIDENCE_NOT_IGNORED",
      "The evidence folder is no longer ignored by Git.",
      "Restore the evidence ignore rule before continuing.",
      3,
    );
  safePath(ctx.run.repo, ctx.run.evidence);
  const tools: Record<string, string> = {
    node: process.version,
    spyglass: "1.2.0",
  };
  for (const [name, args] of [
    ...(ctx.run.web ? [["browser", ["agent-browser", "--version"]]] : []),
    ...(ctx.run.profile.compose
      ? [["compose", ["docker", "compose", "version", "--short"]]]
      : []),
  ] as [string, string[]][]) {
    const result = await ctx.execute(args, { timeoutMs: 10000 });
    if (result.exitCode !== 0)
      throw new Fault(
        "TOOL_UNAVAILABLE",
        `${name} is required by this profile but is unavailable.`,
        `Install the configured ${name} tool and retry doctor.`,
        3,
      );
    tools[name] = result.stdout.trim();
  }
  const environment = { evidenceIgnored: true, tools };
  const command = ctx.run.profile.launch.doctor;
  if (command) {
    const r = await ctx.execute(command, {
      env: ctx.vault.environment(process.env, ctx.run.profile.launch.env),
      timeoutMs: 120000,
    });
    ctx.artifact("doctor-output.json", r);
    let body: unknown;
    try {
      body = JSON.parse(r.stdout);
    } catch {}
    if (
      r.exitCode !== 0 ||
      (body && typeof body === "object" && "ok" in body && body.ok === false)
    )
      throw new Fault(
        "OWNER_DOCTOR_FAILED",
        "The repository owner doctor failed.",
        "Inspect doctor output and repair through the owner tool.",
        1,
        { exitCode: r.exitCode, doctor: body ?? r.stdout },
      );
  }
  await ready(ctx);
  assertSource(ctx.run);
  let database: unknown;
  if (ctx.run.profile.db) {
    ctx.vault.resolve(ctx.run.profile.db.connection);
    const m = await import("./surfaces.js");
    database = await m.readDatabaseRole(ctx);
  }

  let browser: Record<string, unknown> | undefined;
  if (Object.keys(ctx.run.sessions).length || ctx.run.browserProxy)
    browser = await (await import("./browser.js")).browserDoctor(ctx);
  ctx.run.lastDoctor = ctx.step.id;
  const { resultRules: _rules, ...state } = status(ctx.run);
  return {
    ready: true,
    environment,
    ...state,
    ...(database ? { database } : {}),
    ...(browser ?? {}),
  };
}
export async function stopOwned(ctx: Context): Promise<void> {
  const p = ctx.run.process;
  if (!p) return;
  const owns = isSameProcess(p.pid, p.identity);
  let members = processGroupMembers(p.pid);
  if (!owns && members.length)
    throw new Fault(
      "PROCESS_OWNER_LOST",
      "The process-group owner changed while members remain.",
      "Inspect the retained process identity; cleanup will not signal an unverified group.",
      3,
    );
  if (owns) {
    const known = new Map(members.map((m) => [m.pid, m.identity]));
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
    const end = Date.now() + 800;
    do {
      members = processGroupMembers(p.pid);
      if (!members.length) break;
      await delay(50);
    } while (Date.now() < end);
    if (members.length) {
      const anchor = members.some((m) => known.get(m.pid) === m.identity);
      if (!anchor)
        throw new Fault(
          "PROCESS_OWNER_LOST",
          "No verified owned process remains in this group.",
          "Inspect process ownership before cleanup.",
          3,
        );
      try {
        process.kill(-p.pid, "SIGKILL");
      } catch {}
      const deadline = Date.now() + 2000;
      do {
        members = processGroupMembers(p.pid);
        if (!members.length) break;
        await delay(50);
      } while (Date.now() < deadline);
    }
    if (members.length)
      throw new Fault(
        "CLEANUP_FAILED",
        "Owned process-group members are still active.",
        "Inspect the recorded process group before retrying down.",
        3,
      );
  }

  delete ctx.run.process;
}
export async function launch(ctx: Context): Promise<Record<string, unknown>> {
  const { run } = ctx;
  ctx.artifact("profile.json", run.profile, "configuration");
  ctx.artifact("plan.json", run.plan, "configuration");
  try {
    if (run.profile.launch.mode === "owned") {
      if (!processIdentity(process.pid))
        throw new Fault(
          "PROCESS_INSPECTION_FAILED",
          "Cannot establish process ownership before launch.",
          "Allow process inspection and retry with a new run.",
          3,
        );
      processGroupMembers(process.pid);
      const log = join(run.evidence, "spyglass/launch.log");
      const env = ctx.vault.environment(process.env, run.profile.launch.env);
      const appState = join(run.evidence, "spyglass/app-state.json");
      writeJson(appState, { status: "starting" });
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL("./supervisor.js", import.meta.url))],
        {
          cwd: run.repo,
          env: process.env,
          detached: true,
          stdio: ["pipe", "ignore", "ignore"],
        },
      );
      child.stdin.on("error", () => {});
      await new Promise<void>((ok, no) => {
        child.once("error", no);
        child.once("spawn", () => {
          child.stdin.end(
            JSON.stringify({
              command: run.profile.launch.command,
              cwd: run.repo,
              env,
              log,
              appState,
              secrets: ctx.vault.all(),
            }),
            ok,
          );
        });
      });
      if (!child.pid)
        throw new Fault(
          "LAUNCH_FAILED",
          "No process was allocated.",
          "Check Node and the launch command.",
          3,
        );
      const identity = processIdentity(child.pid);
      if (!identity) {
        // Retain an unverified group if signaling fails; cleanup must not claim success.
        run.process = { pid: child.pid, identity: "unverified" };
        // Do not let a state-write failure prevent cleanup through the live child handle.
        if (child.exitCode === null && child.signalCode === null)
          await new Promise<void>((resolve, reject) => {
            const done = (error?: unknown) => {
              clearTimeout(timer);
              child.removeListener("close", closed);
              if (error) reject(error);
              else resolve();
            };
            const closed = () => done();
            const timer = setTimeout(
              () =>
                done(
                  new Fault(
                    "CLEANUP_FAILED",
                    "The unverified launch did not stop.",
                    "Inspect the retained process group before retrying cleanup.",
                    3,
                  ),
                ),
              2000,
            );
            child.once("close", closed);
            try {
              process.kill(-child.pid!, "SIGKILL");
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ESRCH") done();
              else
                done(
                  new Fault(
                    "CLEANUP_FAILED",
                    "Cannot stop the unverified launch.",
                    "Check process signaling permissions and inspect the retained process group.",
                    3,
                  ),
                );
            }
          });
        // stopOwned verifies that no group members remain before dropping this record.
        throw new Fault(
          "PROCESS_INSPECTION_FAILED",
          "Cannot retain the launched process identity.",
          "Check process inspection permissions and retry with a new run.",
          3,
        );
      }
      run.process = { pid: child.pid, identity };
      child.unref();
      saveRun(run);
    }
    await doctor(ctx);
    run.state = "ready";
    return status(run);
  } catch (e) {
    run.state = "failed";
    await stopOwned(ctx);
    const log = join(run.evidence, "spyglass/launch.log");
    if (existsSync(log)) ctx.artifact("startup.log", readFileSync(log, "utf8"));
    throw e;
  }
}
