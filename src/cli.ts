#!/usr/bin/env node
import { commandHelp } from "./help.js";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Fault, fault, requireValue } from "./errors.js";
import {
  Context,
  assertSource,
  assertWorktree,
  loadRun,
  lock,
  runs,
  saveRun,
} from "./state.js";
import type { Run, StepLinks } from "./state.js";
const help = `Spyglass — verify a change and retain its evidence.

Commands:
  schema profile|plan|result   Print the version 1 JSON schema
  init                         Discover a repository profile without starting it
  up [--plan FILE]             Create an isolated run and check readiness
  status [--run ID]            Inspect runs and active commands
  doctor                       Check the owner, app and source baseline
  check NAME                   Run a named verification check
  exec -- COMMAND [ARGS]       Record a child command and its real exit code
  ui open PATH | snapshot | proof NAME | focused | login SEAT | errors
  api METHOD PATH [--expect STATUS] [--data JSON] [--seat NAME]
  db SQL [--expect-rows N]      Run one read-only PostgreSQL statement
  ps | logs SERVICE            Inspect the profile's Compose project
  mark NAME                    Save a timestamp for later log inspection
  evidence add --step ID --file PATH
  result [--file FILE] [--check]  Validate and record claim results
  result set --claim ID ...    Edit the pending result with flags
  down                         Clean up this run's owned resources
  report                       Write an offline evidence report

Step flags on ui, api, db, check, exec, evidence: --claim ID --independent-read
  --control ID:failed|restored --gate NAME link the step into the pending result.
Global options: --json --run ID --profile PATH --binding NAME=VALUE
SPYGLASS_RUN selects an existing run. --run takes precedence.
Exit codes: 0 success; 1 failed verification; 2 invalid input; 3 environment failure.
Examples:
  spyglass init
  spyglass up --run change-42 --plan verification-plan.json --json
  spyglass check verify --run change-42 --json
  spyglass ui open / --run change-42
  spyglass down --run change-42
  spyglass report --run change-42
A successful command is evidence for a step. It does not by itself prove a claim.`;
const linkCommands = ["ui", "api", "db", "check", "exec", "evidence"];
/**
 * Take the step-linking flags out of a driving command's arguments, so the
 * command module never sees them. Arguments after `--` belong to the child.
 */
function takeLinks(rest: string[]): StepLinks {
  const links: StepLinks = {
    claims: [],
    independentRead: false,
    controls: [],
    gates: [],
  };
  let end = rest.includes("--") ? rest.indexOf("--") : rest.length;
  for (let i = 0; i < end;) {
    const a = rest[i]!;
    if (a === "--independent-read") {
      links.independentRead = true;
      rest.splice(i, 1);
      end--;
    } else if (["--claim", "--control", "--gate"].includes(a)) {
      const v = requireValue(rest[i + 1], a);
      if (a === "--claim") links.claims.push(v);
      else if (a === "--gate") links.gates.push(v);
      else {
        const at = v.lastIndexOf(":");
        const state = v.slice(at + 1);
        if (at < 1 || (state !== "failed" && state !== "restored"))
          throw new Fault(
            "INVALID_USAGE",
            "--control needs ID:failed or ID:restored.",
            "Use --control ready-control:failed for the failing attempt and --control ready-control:restored for the passing one.",
          );
        links.controls.push({ id: v.slice(0, at), state });
      }
      rest.splice(i, 2);
      end -= 2;
    } else i++;
  }
  return links;
}
function linked(links: StepLinks): boolean {
  return Boolean(
    links.claims.length ||
    links.controls.length ||
    links.gates.length ||
    links.independentRead,
  );
}
/** Refuse a link to a claim, control or gate that the plan lacks. */
function checkLinks(run: Run, links: StepLinks): void {
  const unknown = (kind: string, names: string[], known: string[]) => {
    const bad = names.find((name) => !known.includes(name));
    if (bad !== undefined)
      throw new Fault(
        `UNKNOWN_${kind.toUpperCase()}`,
        `The plan of run ${run.id} has no ${kind} ${bad}. Known ${kind}s: ${known.join(", ") || "none"}.`,
        `Use a ${kind} ID from spyglass status --run ${run.id}.`,
      );
  };
  if (links.independentRead && !links.claims.length)
    throw new Fault(
      "INVALID_USAGE",
      "--independent-read needs --claim ID.",
      "Add --claim ID to the step that reads the completed state.",
    );
  unknown(
    "claim",
    links.claims,
    run.plan.claims.map((c) => c.id),
  );
  unknown(
    "control",
    links.controls.map((c) => c.id),
    run.plan.controls.map((c) => c.id),
  );
  unknown("gate", links.gates, run.plan.gates);
}

const raw = process.argv.slice(2);
let json = false;
let selected: string | undefined;
let profile: string | undefined;
let plan: string | undefined;
const bindings: Record<string, string> = {};
let directCmd: string | undefined;
let ready: string | undefined;
const args: string[] = [];
let ctx: Context | undefined;
let run: Run | undefined;
let release: (() => void) | undefined;
function render(data: Record<string, unknown>): string {
  if ("schema" in data) return JSON.stringify(data.schema, null, 2);
  // Owner cleanup, the next command and the rules print after the other
  // fields, inside the same bound: an operator acts on each, so a long field
  // must not cut them.
  const { owner, ownerCleanupRequired, next, resultRules, ...compact } = data;
  if (compact.source && typeof compact.source === "object") {
    const s = compact.source as Record<string, unknown>;
    compact.source = { commit: s.commit, hash: s.hash };
  }
  if (compact.plan && typeof compact.plan === "object") {
    const p = compact.plan as Record<string, unknown>;
    compact.plan = {
      claims: Array.isArray(p.claims)
        ? p.claims.map((c: { id: string }) => c.id)
        : [],
      gates: p.gates,
    };
  }
  const safeText = (value: unknown): string =>
    String(value).replace(
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,
      (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
    );
  const lines = (value: unknown, indent = ""): string[] => {
    if (Array.isArray(value))
      return value.length
        ? value.flatMap((item) =>
            typeof item === "object" && item !== null
              ? [indent + "-", ...lines(item, indent + "  ")]
              : [indent + "- " + safeText(item)],
          )
        : [indent + "none"];
    if (value !== null && typeof value === "object")
      return Object.entries(value).flatMap(([key, item]) => {
        if (item === undefined) return [];
        return item !== null && typeof item === "object"
          ? [indent + safeText(key) + ":", ...lines(item, indent + "  ")]
          : [indent + safeText(key) + ": " + safeText(item)];
      });
    return [indent + safeText(value)];
  };
  const text = lines(compact).join("\n");
  // Only a command that records a step writes its result to the run log.
  const full =
    run && ctx ? `${run.evidence}/spyglass/log.jsonl` : "rerun with --json";
  const allRules =
    resultRules === undefined ? "" : lines({ resultRules }).join("\n");
  const rules =
    allRules.length > 2000
      ? allRules.slice(0, 2000) + `\n… Full rules: ${full}`
      : allRules;
  const tail = [lines({ owner, ownerCleanupRequired, next }).join("\n"), rules]
    .filter(Boolean)
    .join("\n");
  const limit = 3500 - tail.length;
  const body =
    text.length > limit
      ? text.slice(0, limit) + `\n… Full result: ${full}`
      : text;
  return tail ? `${body}\n${tail}` : body;
}
function emit(data: Record<string, unknown>, error?: Fault): void {
  const envelope = {
    schemaVersion: 1,
    ok: !error,
    status: error ? "failed" : "passed",
    run: run?.id ?? null,
    step: ctx?.step.id ?? null,
    data: ctx
      ? ctx.vault.clean(ctx.linked ? { ...data, linked: ctx.linked } : data)
      : data,
    artifacts: ctx?.step.artifacts ?? [],
    error: error
      ? {
          code: error.code,
          message: ctx ? ctx.vault.text(error.message) : error.message,
          next: error.next,
        }
      : null,
  };
  if (json) console.log(JSON.stringify(envelope));
  else if (error) {
    console.error(
      `${error.code}: ${envelope.error?.message}\nNext: ${error.next}`,
    );
    if (Object.keys(data).length) console.log(render(envelope.data));
  } else if ("help" in data) console.log(data.help);
  else console.log(render(envelope.data));
  process.exitCode = error?.exit ?? 0;
}
function repository(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Fault(
      "NOT_REPOSITORY",
      "Spyglass requires a Git working tree.",
      "Run git init in the target project, then run spyglass init.",
    );
  return realpathSync(result.stdout.trim());
}
try {
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    if (a === "--") {
      args.push(...raw.slice(i));
      break;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (
      [
        "--run",
        "--profile",
        "--plan",
        "--binding",
        "--cmd",
        "--ready",
      ].includes(a)
    ) {
      const v = requireValue(raw[++i], a);
      if (a === "--run") selected = v;
      else if (a === "--profile") profile = v;
      else if (a === "--plan") plan = v;
      else if (a === "--cmd") directCmd = v;
      else if (a === "--ready") ready = v;
      else {
        const at = v.indexOf("=");
        if (at < 1)
          throw new Fault(
            "INVALID_BINDING",
            "Binding must be NAME=VALUE.",
            "Use --binding installation=local.",
          );
        bindings[v.slice(0, at)] = v.slice(at + 1);
      }
      continue;
    }
    args.push(a);
  }
  const ownArgs = args.slice(
    0,
    args.includes("--") ? args.indexOf("--") : args.length,
  );
  if (ownArgs.includes("--version")) {
    if (json) emit({ version: "1.2.0" });
    else console.log("1.2.0");
  } else if (args[0] === "ui" && ownArgs.includes("--help")) {
    const b = await import("./browser.js");
    emit(b.browserHelp());
  } else if (!args.length || ownArgs.includes("--help") || args[0] === "help")
    emit({ help: commandHelp(args[0] ?? "") ?? help });
  else if (args[0] === "schema") {
    const name = args[1];
    const m = await import("./schema.js");
    const z = await import("zod");
    const schema =
      name === "profile"
        ? m.profileSchema
        : name === "plan"
          ? m.planSchema
          : name === "result"
            ? m.resultSchema
            : undefined;
    if (!schema)
      throw new Fault(
        "UNKNOWN_SCHEMA",
        "Choose profile, plan or result.",
        "Run spyglass schema profile --json.",
      );
    emit({ schema: z.z.toJSONSchema(schema) });
  } else {
    const command = args[0]!;
    const known = [
      "init",
      "up",
      "status",
      "doctor",
      "down",
      "check",
      "exec",
      "evidence",
      "artifact",
      "result",
      "report",
      "ui",
      "api",
      "db",
      "ps",
      "logs",
      "mark",
    ];
    if (!known.includes(command))
      throw new Fault(
        "UNKNOWN_COMMAND",
        `Unknown command ${command}.`,
        "Run spyglass --help.",
      );
    const allowed: Record<string, string[]> = {
      init: ["--force"],
      result:
        args[1] === "set"
          ? [
              "--claim",
              "--gate",
              "--control",
              "--outcome",
              "--observed",
              "--reason",
              "--step",
              "--artifact",
              "--independent-read",
              "--inspect",
              "--expected",
              "--observed-failure",
              "--observed-pass",
              "--failed-run",
              "--failed-step",
              "--restored-step",
              "--operator",
              "--limit",
            ]
          : ["--file", "--check"],
      evidence: ["--step", "--file"],
      artifact: ["--step", "--file"],
      api: ["--seat", "--data", "--expect"],
      db: ["--expect-rows"],
      logs: ["--since"],
    };
    let links: StepLinks | undefined;
    if (linkCommands.includes(command)) {
      const rest = args.splice(1);
      links = takeLinks(rest);
      args.push(...rest);
    }
    if (!["exec", "ui"].includes(command))
      for (const a of args.slice(1))
        if (a.startsWith("--") && !(allowed[command] ?? []).includes(a))
          throw new Fault(
            "UNKNOWN_OPTION",
            `Unknown option ${a} for ${command}.`,
            "Run spyglass --help.",
          );
    const repo = repository();
    if (command !== "up") selected ??= process.env.SPYGLASS_RUN;
    if (command === "init") {
      const m = await import("./profile.js");
      emit(m.init(repo, args.includes("--force")));
    } else if (command === "status") {
      const m = await import("./lifecycle.js");
      if (selected) {
        run = loadRun(repo, selected);
        emit(m.status(run));
      } else emit({ runs: runs(repo).map(m.status) });
    } else {
      if (command === "up") {
        const m = await import("./lifecycle.js");
        run = await m.allocate(repo, {
          id: selected,
          profile,
          plan,
          bindings,
          cmd: directCmd,
          ready,
        });
      } else {
        run = loadRun(repo, requireValue(selected, "--run ID"));
        assertWorktree(run, repo, command);
      }
      release = lock(run, command);
      run = loadRun(repo, run.id);
      ctx = new Context(run, command, args.slice(1));
      if (links && linked(links)) {
        checkLinks(run, links);
        ctx.links = links;
        // The evidence belongs to the step it attaches to as well.
        if (command === "evidence") {
          const at = args.indexOf("--step");
          if (at > 0 && args[at + 1]) links.evidenceFor = args[at + 1];
        }
      }
      let data: Record<string, unknown>;
      if (["exec", "check", "ui", "api", "db"].includes(command)) {
        if (
          run.state !== "ready" &&
          !(command === "check" && run.profile.checks[args[1] ?? ""]?.cleanup)
        )
          throw new Fault(
            "RUN_NOT_READY",
            `Run ${run.id} is ${run.state}.`,
            "Create a ready run before driving the target.",
            1,
          );
        if (command !== "ui") assertSource(run);
      }
      switch (command) {
        case "up":
          data = await (await import("./lifecycle.js")).launch(ctx);
          break;
        case "doctor":
          data = await (await import("./lifecycle.js")).doctor(ctx);
          break;
        case "down": {
          if (Object.keys(run.sessions).length || run.browserProxy) {
            const b = await import("./browser.js");
            await b.closeBrowsers(ctx);
          }
          const lifecycle = await import("./lifecycle.js");
          await lifecycle.stopOwned(ctx);
          run.cleanup = true;
          run.state = "stopped";
          const log = join(run.evidence, "spyglass/launch.log");
          if (existsSync(log))
            ctx.artifact("launch-final.log", readFileSync(log, "utf8"));
          const { resultRules: _rules, ...stopped } = lifecycle.status(run);
          data = { ...stopped, ownerCleanupRequired: !run.ownerCleaned };
          break;
        }
        case "check":
        case "exec":
        case "evidence":
        case "artifact": {
          const m = await import("./checks.js");
          data = await m.checks(ctx, args);
          break;
        }
        case "result":
        case "report": {
          const m = await import("./report.js");
          data = await m.report(ctx, args);
          break;
        }
        case "ui": {
          const m = await import("./browser.js");
          data = await m.browser(ctx, args.slice(1));
          break;
        }
        case "api":
        case "db":
        case "ps":
        case "logs":
        case "mark": {
          const m = await import("./surfaces.js");
          data = await m.surfaces(ctx, args);
          break;
        }
        default:
          throw new Fault(
            "UNKNOWN_COMMAND",
            `Unknown command ${command}.`,
            "Run spyglass --help.",
          );
      }
      ctx.finish(
        typeof data.exitCode === "number" ? data.exitCode : 0,
        data,
        0,
      );
      emit(data);
    }
  }
} catch (error) {
  const e = fault(error);
  if (ctx) {
    try {
      ctx.finish(
        typeof e.data.exitCode === "number" ? e.data.exitCode : e.exit,
        {
          ...e.data,
          passed: false,
          error: { code: e.code, message: ctx.vault.text(e.message) },
        },
        e.exit,
      );
    } catch (logError) {
      e.message += `; cannot retain step: ${String(logError)}`;
    }
  }
  emit({ ...e.data, ...(run ? { id: run.id } : {}) }, e);
} finally {
  release?.();
}
