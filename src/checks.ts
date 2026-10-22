import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Fault, fault } from "./errors.js";
import { regular, safePath } from "./files.js";
import { template } from "./profile.js";
import type { Artifact, Context } from "./state.js";
import { assertSource, sourceChanges, steps } from "./state.js";

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
  assertSource(ctx.run);
  const result = await ctx.execute(command, {
    timeoutMs: 300000,
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
