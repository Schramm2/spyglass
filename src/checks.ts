import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Fault, fault } from "./errors.js";
import { regular, safePath } from "./files.js";
import { template } from "./profile.js";
import type { Artifact, Run, StepLinks } from "./state.js";
import { Context, assertSource, sourceChanges, steps } from "./state.js";

interface Assertion {
  id: string;
  ok: boolean;
  detail?: unknown;
}
interface StructuredResult {
  claims: Assertion[];
  skips: string[];
  overall: boolean | null;
  found: boolean;
  malformedAssertions: number;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Fault(
      "MISSING_INPUT",
      `${flag} requires a value.`,
      `Supply ${flag} VALUE.`,
    );
  return value;
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Result fields belong to the runner envelope. Nested action payloads can use
// words such as "skipped" and "success" for application behavior.
function valuesAt(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => valuesAt(item, key));
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return Object.hasOwn(object, key) ? [object[key]] : [];
}

function normalizeStructured(inputs: unknown[]): StructuredResult {
  const claims: Assertion[] = [];
  const skips: string[] = [];
  const seen = new Set<string>();
  const bools: boolean[] = [];
  let found = false;
  let malformedAssertions = 0;

  const addAssertion = (item: unknown): boolean => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    const id = row.id ?? row.claim ?? row.name ?? row.assertion;
    const status = row.ok ?? row.success ?? row.passed;
    if (
      (typeof id !== "string" && typeof id !== "number") ||
      !String(id).trim() ||
      typeof status !== "boolean"
    )
      return false;
    const assertion: Assertion = { id: String(id).trim(), ok: status };
    const detail = row.detail ?? row.message ?? row.error;
    if (detail !== undefined) assertion.detail = detail;
    const key = `${assertion.id}\0${assertion.ok}\0${JSON.stringify(assertion.detail ?? "")}`;
    if (!seen.has(key)) {
      seen.add(key);
      claims.push(assertion);
    }
    found = true;
    return true;
  };
  const addSkips = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const value of item) {
        if (typeof value === "string" || typeof value === "number")
          skips.push(String(value));
        else if (value && typeof value === "object") {
          const row = value as Record<string, unknown>;
          skips.push(
            String(
              row.id ??
                row.claim ??
                row.name ??
                row.reason ??
                "unspecified check",
            ),
          );
        }
      }
    } else if (typeof item === "string" || typeof item === "number")
      skips.push(String(item));
  };
  for (const input of inputs) {
    for (const key of ["claims", "assertions", "checks"]) {
      for (const array of valuesAt(input, key)) {
        if (!Array.isArray(array)) continue;
        for (const item of array)
          if (!addAssertion(item)) malformedAssertions++;
      }
    }
    for (const key of ["skips", "skipped", "skippedChecks", "skipped_checks"]) {
      for (const item of valuesAt(input, key)) addSkips(item);
    }
    for (const key of ["ok", "success"]) {
      for (const value of valuesAt(input, key))
        if (typeof value === "boolean") {
          bools.push(value);
          found = true;
        }
    }
  }
  const uniqueSkips = [...new Set(skips)];
  return {
    claims,
    skips: uniqueSkips,
    overall: bools.includes(false) ? false : bools.includes(true) ? true : null,
    found,
    malformedAssertions,
  };
}

function artifactJson(ctx: Context, artifact: Artifact): unknown | undefined {
  const ext = artifact.path.split(".").at(-1)?.toLowerCase();
  if (ext !== "json" && ext !== "jsonl") return undefined;
  const file = safePath(join(ctx.run.evidence, "spyglass"), artifact.path);
  if (!existsSync(file)) return undefined;
  regular(file);
  const text = readFileSync(file, "utf8");
  if (ext === "json") return parseJson(text);
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      const parsed = parseJson(line);
      return parsed === undefined ? [] : [parsed];
    });
}

function structuredPath(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const row = value as Record<string, unknown>;
  const path = row.evidence ?? row.resultFile ?? row.result_file;
  return typeof path === "string" ? path : undefined;
}

function checkSourceChanges(ctx: Context): string[] {
  return sourceChanges(ctx.run);
}

async function exec(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  const separator = args.indexOf("--");
  const command = separator < 0 ? [] : args.slice(separator + 1);
  if (separator < 0 || !command[0])
    throw new Fault(
      "INVALID_USAGE",
      "exec requires `-- <command> [args]`.",
      "Run spyglass exec -- <command> [args].",
    );
  const options = args.slice(1, separator);
  if (options.length && (options.length !== 2 || options[0] !== "--timeout-ms"))
    throw new Fault(
      "INVALID_USAGE",
      "exec accepts only --timeout-ms MILLISECONDS before --.",
      "Run spyglass exec --timeout-ms 900000 -- COMMAND [ARGS].",
    );
  const timeoutMs = options.length ? Number(options[1]) : 300000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 86400000)
    throw new Fault(
      "INVALID_USAGE",
      "--timeout-ms must be an integer from 1 to 86400000.",
      "Use a bounded deadline, for example --timeout-ms 900000.",
    );
  assertSource(ctx.run);
  const result = await ctx.execute(command, {
    timeoutMs,
    maxBytes: 8 * 1024 * 1024,
  });
  const output = ctx.artifact(
    `${command[0]}-output.txt`,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    "command-output",
  );
  const data = ctx.vault.clean({
    command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    timeoutMs,
    artifacts: [output],
    passed: result.exitCode === 0,
  });
  const changed = checkSourceChanges(ctx);
  if (changed.length)
    throw new Fault(
      "STALE_SOURCE",
      `Source changed while exec was running: ${changed.join(", ")}.`,
      "Keep this attempt and create a new run from the final source.",
      1,
      { ...data, passed: false, changed },
    );
  if (result.exitCode !== 0)
    throw new Fault(
      "COMMAND_FAILED",
      `Command exited with status ${result.exitCode}${result.timedOut ? " after its timeout" : ""}.`,
      "Inspect the retained output, fix the cause, and rerun the check.",
      1,
      data,
    );
  return data;
}

async function namedCheck(
  ctx: Context,
  name: string,
): Promise<Record<string, unknown>> {
  const check = ctx.run.profile.checks[name];
  if (!check) {
    const names = Object.keys(ctx.run.profile.checks);
    throw new Fault(
      "UNKNOWN_CHECK",
      `Unknown check ${name}. Available checks: ${names.join(", ") || "none"}.`,
      "Choose a check from the profile or use spyglass exec -- <command>.",
    );
  }
  assertSource(ctx.run);
  const bindings = {
    ...(ctx.run.profile.bindings ?? {}),
    run: ctx.run.id,
    port: String(ctx.run.port),
    web: ctx.run.web ?? "",
    api: ctx.run.api ?? "",
  };
  const expanded = template(check, bindings);
  const command = expanded.command;
  const env = ctx.vault.environment(process.env, expanded.env ?? {});
  const result = await ctx.execute(command, {
    env,
    timeoutMs: expanded.timeoutMs ?? 300000,
    maxBytes: 8 * 1024 * 1024,
  });
  const output = ctx.artifact(
    `${name}-output.txt`,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    "command-output",
  );
  const imported: Artifact[] = [];
  const importedSources = new Set(
    expanded.artifacts.map((path) => resolve(ctx.run.repo, path)),
  );
  const importErrors: Array<{ path: string; code: string; message: string }> =
    [];
  const structuredInputs: unknown[] = [];
  const stdoutJson = parseJson(result.stdout.trim());
  if (stdoutJson !== undefined) structuredInputs.push(stdoutJson);

  for (const path of expanded.artifacts) {
    try {
      const artifact = ctx.importArtifact(path);
      imported.push(artifact);
      const parsed = artifactJson(ctx, artifact);
      if (parsed !== undefined) structuredInputs.push(parsed);
    } catch (error) {
      const issue = fault(error);
      importErrors.push({ path, code: issue.code, message: issue.message });
    }
  }
  if (expanded.result === "engine") {
    const candidate = stdoutJson;
    const path = structuredPath(candidate);
    if (path && !importedSources.has(resolve(ctx.run.repo, path))) {
      try {
        const artifact = ctx.importArtifact(path);
        imported.push(artifact);
        importedSources.add(resolve(ctx.run.repo, path));
        const parsed = artifactJson(ctx, artifact);
        if (parsed !== undefined) structuredInputs.push(parsed);
      } catch (error) {
        const issue = fault(error);
        importErrors.push({ path, code: issue.code, message: issue.message });
      }
    }
  }

  const parsed = normalizeStructured(structuredInputs);
  const assertionFailure = parsed.claims.some((item) => !item.ok);
  const structuredMissing =
    (expanded.result === "engine" || expanded.result === "json") &&
    parsed.claims.length === 0;
  const malformedAssertions = parsed.malformedAssertions > 0;
  const passed =
    result.exitCode === 0 &&
    !result.timedOut &&
    !assertionFailure &&
    parsed.skips.length === 0 &&
    !importErrors.length &&
    !structuredMissing &&
    !malformedAssertions &&
    parsed.overall !== false;
  const data = ctx.vault.clean({
    check: name,
    attempt: ctx.step.id,
    command,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    claims: parsed.claims,
    skips: parsed.skips,
    overall: parsed.overall,
    malformedAssertions: parsed.malformedAssertions,
    artifacts: [output, ...imported],
    importErrors,
    passed,
  });
  const changed = checkSourceChanges(ctx);
  if (changed.length)
    throw new Fault(
      "STALE_SOURCE",
      `Source changed while check ${name} was running: ${changed.join(", ")}.`,
      "Keep this attempt and create a new run from the final source.",
      1,
      { ...data, changed },
    );
  if (passed && expanded.cleanup) ctx.run.ownerCleaned = true;
  if (!passed) {
    const reasons = [
      result.exitCode !== 0 ? `command exit ${result.exitCode}` : "",
      assertionFailure ? "one or more assertions failed" : "",
      parsed.skips.length ? `skipped checks: ${parsed.skips.join(", ")}` : "",
      importErrors.length
        ? `artifact import failed: ${importErrors.map((item) => item.path).join(", ")}`
        : "",
      structuredMissing ? "the command produced no structured assertions" : "",
      malformedAssertions
        ? `${parsed.malformedAssertions} malformed assertion row(s)`
        : "",
      parsed.overall === false ? "the structured result reports failure" : "",
    ].filter(Boolean);
    throw new Fault(
      "CHECK_FAILED",
      `Check ${name} failed: ${reasons.join("; ") || "the check did not pass"}.`,
      "Inspect the retained attempt and artifacts, correct the cause, then rerun the check.",
      1,
      data,
    );
  }
  return data;
}

async function addEvidence(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  const step = valueAfter(args, "--step");
  const file = valueAfter(args, "--file");
  if (!step || !file)
    throw new Fault(
      "INVALID_USAGE",
      "evidence add requires --step and --file.",
      "Run spyglass evidence add --step STEP_ID --file PATH.",
    );
  const producer = steps(ctx.run).find((item) => item.id === step);
  if (!producer)
    throw new Fault(
      "UNKNOWN_STEP",
      `Unknown step ${step}.`,
      "Choose a step ID from spyglass status or the run log.",
    );
  const artifact = ctx.importArtifact(file);
  return ctx.vault.clean({
    attachedTo: producer.id,
    command: producer.command,
    source: producer.source,
    artifact,
  });
}

export async function checks(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  const command = args[0];
  if (command === "exec") return exec(ctx, args);
  if (command === "check") {
    const name = args[1];
    if (!name || name.startsWith("--"))
      throw new Fault(
        "MISSING_INPUT",
        "check requires a name.",
        "Run spyglass check NAME.",
      );
    if (args.length > 2)
      throw new Fault(
        "INVALID_USAGE",
        `Unexpected check argument ${args[2]}.`,
        "Run spyglass check NAME.",
      );
    return namedCheck(ctx, name);
  }
  if (command === "evidence" && args[1] === "add")
    return addEvidence(ctx, args);
  throw new Fault(
    "INVALID_USAGE",
    `Unsupported check command ${args.join(" ")}.`,
    "Use check NAME, exec -- COMMAND, or evidence add --step ID --file PATH.",
  );
}

export const MAX_CONCURRENCY = 8;
export interface ParallelRequest {
  /** Check names; or every planned gate that has a profile check. */
  names?: string[];
  gates?: boolean;
  concurrency: number;
  links?: StepLinks;
}
/**
 * Run independent checks at the same time. This process holds the run lock
 * and records each finished step in the log, one write at a time, so the log
 * and run.json stay whole. The checks must not change the source: a change
 * stops every check that finishes after it.
 */
export async function parallelChecks(
  run: Run,
  request: ParallelRequest,
  track: (ctx: Context) => void,
): Promise<{ data: Record<string, unknown>; fault?: Fault }> {
  const planned = run.plan.gates;
  const names = request.gates
    ? planned.filter((gate) => run.profile.checks[gate])
    : (request.names ?? []);
  const skippedGates = request.gates
    ? planned.filter((gate) => !run.profile.checks[gate])
    : [];
  if (!names.length)
    throw new Fault(
      "INVALID_USAGE",
      request.gates
        ? "No planned gate has a profile check of the same name."
        : "check needs at least one name.",
      request.gates
        ? "Name the gate checks in the profile as the plan names its gates, or run each gate with exec --gate."
        : "Run spyglass check NAME or spyglass check a,b.",
    );
  const unknown = names.find((name) => !run.profile.checks[name]);
  if (unknown !== undefined)
    throw new Fault(
      "UNKNOWN_CHECK",
      `Unknown check ${unknown}. Available checks: ${Object.keys(run.profile.checks).join(", ") || "none"}.`,
      "Choose checks from the profile.",
    );
  if (
    run.state !== "ready" &&
    !names.every((name) => run.profile.checks[name]?.cleanup)
  )
    throw new Fault(
      "RUN_NOT_READY",
      `Run ${run.id} is ${run.state}.`,
      "Create a ready run before driving the target.",
      1,
    );
  const records: {
    name: string;
    step?: string;
    status?: "passed" | "failed";
    code?: string;
    message?: string;
    durationMs?: number;
  }[] = names.map((name) => ({ name }));
  const runOne = async (index: number): Promise<void> => {
    const name = names[index]!;
    const ctx = new Context(run, "check", [name]);
    ctx.links = request.gates
      ? { claims: [], independentRead: false, controls: [], gates: [name] }
      : request.links;
    try {
      const data = await namedCheck(ctx, name);
      ctx.finish(0, data, 0);
      records[index] = {
        name,
        step: ctx.step.id,
        status: "passed",
        durationMs: ctx.step.durationMs,
      };
    } catch (error) {
      const failure = fault(error);
      try {
        ctx.finish(
          typeof failure.data.exitCode === "number"
            ? failure.data.exitCode
            : failure.exit,
          {
            ...failure.data,
            passed: false,
            error: {
              code: failure.code,
              message: ctx.vault.text(failure.message),
            },
          },
          failure.exit,
        );
      } catch (logError) {
        failure.message += `; cannot retain step: ${String(logError)}`;
      }
      records[index] = {
        name,
        step: ctx.step.id,
        status: "failed",
        code: failure.code,
        message: ctx.vault.text(failure.message),
        durationMs: ctx.step.durationMs,
      };
    }
    track(ctx);
  };
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= names.length) return;
      await runOne(index);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, request.concurrency), names.length) },
      worker,
    ),
  );
  const failed = records.filter((item) => item.status === "failed");
  const data = {
    checks: records,
    passed: !failed.length,
    concurrency: Math.min(request.concurrency, names.length),
    ...(skippedGates.length ? { skippedGates } : {}),
  };
  return failed.length
    ? {
        data,
        fault: new Fault(
          "CHECK_FAILED",
          `Checks failed: ${failed.map((item) => item.name).join(", ")}.`,
          "Inspect the retained attempts in data.checks, correct the cause, then run the failed checks again.",
          1,
        ),
      }
    : { data };
}
