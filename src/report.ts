import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { Fault } from "./errors.js";
import { hash, readJson, regular, safePath } from "./files.js";
import { loadProfile } from "./profile.js";
import { resultSchema, validate } from "./schema.js";
import type { Plan, Profile, Result } from "./schema.js";
import type { Artifact, Context, Run, Step } from "./state.js";
import { loadRun, source, steps } from "./state.js";

interface Finding {
  code: string;
  message: string;
}
interface VerifiedArtifact {
  artifact: Artifact;
  step: string;
  valid: boolean;
  message?: string;
  mime?: string;
  imageData?: string;
  textData?: string;
}

function requiredValue(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Fault(
      "MISSING_INPUT",
      `${flag} requires a value.`,
      `Supply ${flag} PATH.`,
    );
  return value;
}

function readResultFile(file: string): unknown {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path))
    throw new Fault(
      "MISSING_RESULT",
      `Result file does not exist: ${file}.`,
      "Use the result template from spyglass up or create a valid result JSON file.",
    );
  return readJson(path);
}

function artifactInventory(
  run: Run,
  entries: Step[],
  findings: Finding[],
): VerifiedArtifact[] {
  const all: VerifiedArtifact[] = [];
  for (const entry of entries) {
    for (const artifact of entry.artifacts ?? []) {
      const item: VerifiedArtifact = { artifact, step: entry.id, valid: false };
      try {
        if (
          isAbsolute(artifact.path) ||
          artifact.path.split(/[\\/]/).some((part) => part === "..")
        )
          throw new Fault(
            "UNSAFE_ARTIFACT",
            `Unsafe artifact path ${artifact.path}.`,
            "Import an artifact inside the run evidence folder.",
          );
        const file = safePath(join(run.evidence, "spyglass"), artifact.path);
        if (!existsSync(file))
          throw new Fault(
            "MISSING_ARTIFACT",
            `Artifact is missing: ${artifact.path}.`,
            "Rerun the producing check or restore the retained artifact.",
          );
        regular(file);
        const content = readFileSync(file);
        const actual = hash(content);
        if (actual !== artifact.sha256)
          throw new Fault(
            "ARTIFACT_CHECKSUM",
            `Artifact checksum changed: ${artifact.path}.`,
            "Preserve the original artifact and rerun its producing check.",
          );
        item.valid = true;
        const ext = artifact.path.split(".").at(-1)?.toLowerCase();
        if (ext === "png") {
          item.mime = "image/png";
          item.imageData = content.toString("base64");
        } else if (ext === "jpg" || ext === "jpeg") {
          item.mime = "image/jpeg";
          item.imageData = content.toString("base64");
        } else if (
          !["report", "report-summary"].includes(artifact.kind) &&
          (ext === "json" ||
            ext === "jsonl" ||
            ext === "txt" ||
            ext === "log" ||
            ext === "md" ||
            ext === "csv" ||
            ext === "xml")
        )
          item.textData = content.toString("utf8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        item.message = message;
        findings.push({
          code: error instanceof Fault ? error.code : "ARTIFACT_INVALID",
          message,
        });
      }
      all.push(item);
    }
  }
  return all;
}

function indexArtifacts(
  items: VerifiedArtifact[],
): Map<string, VerifiedArtifact[]> {
  const map = new Map<string, VerifiedArtifact[]>();
  for (const item of items) {
    const list = map.get(item.artifact.path) ?? [];
    list.push(item);
    map.set(item.artifact.path, list);
  }
  return map;
}

function validateClaimProof(
  run: Run,
  plan: Plan,
  result: Result,
  entries: Step[],
  inventory: VerifiedArtifact[],
  findings: Finding[],
): void {
  const planClaims = new Map(plan.claims.map((claim) => [claim.id, claim]));
  const rows = new Map<string, Result["claims"][number]>();
  const stepMap = new Map(
    entries.map((entry, index) => [entry.id, { entry, index }]),
  );
  const artifacts = indexArtifacts(inventory);
  for (const claim of result.claims) {
    if (!planClaims.has(claim.id)) {
      findings.push({
        code: "UNKNOWN_CLAIM",
        message: `Result names claim ${claim.id}, which is not in this run's plan.`,
      });
      continue;
    }
    if (rows.has(claim.id))
      findings.push({
        code: "DUPLICATE_CLAIM",
        message: `Result lists claim ${claim.id} more than once.`,
      });
    rows.set(claim.id, claim);
    const cited = new Set(claim.steps);
    const refs = claim.steps.map((id) => stepMap.get(id));
    if (refs.some((ref) => !ref))
      findings.push({
        code: "MISSING_STEP",
        message: `Claim ${claim.id} names a step that is not in this run log.`,
      });
    const resolved = refs.filter((ref): ref is NonNullable<typeof ref> =>
      Boolean(ref),
    );
    for (const { entry } of resolved) {
      if (!entry.source?.hash || !entry.source?.commit)
        findings.push({
          code: "STEP_SOURCE_MISSING",
          message: `Step ${entry.id} has no source identity.`,
        });
      else if (
        entry.source.hash !== run.source.hash ||
        entry.source.commit !== run.source.commit
      )
        findings.push({
          code: "STEP_SOURCE_MISMATCH",
          message: `Claim ${claim.id} cites step ${entry.id} from a different source identity.`,
        });
    }
    for (const path of claim.artifacts) {
      if (!artifacts.has(path))
        findings.push({
          code: "MISSING_EVIDENCE",
          message: `Claim ${claim.id} names unrecorded evidence ${path}.`,
        });
      else if (!artifacts.get(path)!.some((item) => item.valid))
        findings.push({
          code: "INVALID_EVIDENCE",
          message: `Claim ${claim.id} names missing or changed evidence ${path}.`,
        });
      else if (
        !artifacts.get(path)!.some((item) => item.valid && cited.has(item.step))
      )
        findings.push({
          code: "ARTIFACT_PRODUCER_MISMATCH",
          message: `Claim ${claim.id} cites evidence ${path} from a step that the claim does not cite.`,
        });
    }
    if (claim.outcome !== "passed") continue;
    if (!claim.observed.trim())
      findings.push({
        code: "OBSERVATION_MISSING",
        message: `Passed claim ${claim.id} needs the operator's observed result.`,
      });
    if (!claim.steps.length || !resolved.length) {
      findings.push({
        code: "MISSING_STEP",
        message: `Claim ${claim.id} cannot pass without a completed step.`,
      });
      continue;
    }
    const passingStep = resolved.some(({ entry }) => stepPassed(entry));
    if (!passingStep)
      findings.push({
        code: "FAILED_STEP",
        message: `Claim ${claim.id} has no successful cited step.`,
      });
    const badAssertion = resolved.some(
      ({ entry }) => hasFailedAssertion(entry) || hasSkip(entry),
    );
    if (badAssertion)
      findings.push({
        code: "FAILED_ASSERTION",
        message: `Claim ${claim.id} cites a failed assertion or skipped check.`,
      });
    const attached = resolved.some(({ entry }) =>
      entry.artifacts?.some(
        (item) =>
          item.step === entry.id &&
          artifacts.get(item.path)?.some((candidate) => candidate.valid),
      ),
    );
    const explicit = claim.artifacts.some((path) =>
      artifacts.get(path)?.some((candidate) => candidate.valid),
    );
    if (!attached && !explicit)
      findings.push({
        code: "MISSING_EVIDENCE",
        message: `Claim ${claim.id} cannot pass without existing evidence attached to its steps.`,
      });
    const planned = planClaims.get(claim.id)!;
    for (const requiredCheck of planned.checks.filter((name) =>
      Boolean(run.profile.checks[name]),
    )) {
      const attempts = resolved.filter(
        ({ entry }) => entry.data?.check === requiredCheck,
      );
      if (!attempts.length)
        findings.push({
          code: "NAMED_CHECK_MISSING",
          message: `Claim ${claim.id} has no recorded attempt for required check ${requiredCheck}.`,
        });
      else if (!attempts.some(({ entry }) => stepPassed(entry)))
        findings.push({
          code: "NAMED_CHECK_FAILED",
          message: `Claim ${claim.id} has no successful attempt for required check ${requiredCheck}.`,
        });
    }
    if (planned.kind === "behavior") {
      const behaviorSteps = resolved.filter(
        ({ entry }) => stepPassed(entry) && !administrativeStep(run, entry),
      );
      if (!behaviorSteps.length)
        findings.push({
          code: "BEHAVIOR_PROOF_MISSING",
          message: `Behavior claim ${claim.id} cites no successful behavior check; cleanup and administrative steps cannot prove application behavior.`,
        });
      const evidenceItems = [
        ...resolved.flatMap(({ entry }) =>
          (entry.artifacts ?? [])
            .filter((item) => item.step === entry.id)
            .flatMap((item) => artifacts.get(item.path) ?? []),
        ),
        ...claim.artifacts.flatMap((path) => artifacts.get(path) ?? []),
      ];
      if (
        !evidenceItems.some(
          (item) => item.valid && !isImageArtifact(item.artifact),
        )
      ) {
        findings.push({
          code: "BEHAVIOR_EVIDENCE_MISSING",
          message: `Behavior claim ${claim.id} needs retained non-image evidence; a screenshot alone cannot prove behavior.`,
        });
      }
    }
    if (planned.kind === "visual") {
      if (!claim.inspection && !claim.inspections?.length)
        findings.push({
          code: "VISUAL_INSPECTION_MISSING",
          message: `Visual claim ${claim.id} needs the operator's viewport, expected state and observed differences.`,
        });
      for (const inspection of claim.inspections ?? []) {
        if (
          !/\.(png|jpe?g)$/i.test(inspection.artifact) ||
          !artifacts
            .get(inspection.artifact)
            ?.some((item) => item.valid && cited.has(item.artifact.step))
        )
          findings.push({
            code: "VISUAL_IMAGE_MISSING",
            message: `Visual claim ${claim.id} inspection at ${inspection.viewport} needs a valid screenshot from a cited step: ${inspection.artifact}.`,
          });
      }
      const image = [
        ...claim.artifacts,
        ...resolved.flatMap(({ entry }) =>
          (entry.artifacts ?? [])
            .filter((item) => cited.has(item.step))
            .map((item) => item.path),
        ),
      ].some(
        (path) =>
          /\.(png|jpe?g)$/i.test(path) &&
          artifacts.get(path)?.some((item) => item.valid),
      );
      if (!image)
        findings.push({
          code: "VISUAL_IMAGE_MISSING",
          message: `Visual claim ${claim.id} needs an existing screenshot artifact for inspection.`,
        });
    }
    if (planned.kind === "side-effect") {
      const independent = claim.independentRead
        ? stepMap.get(claim.independentRead)
        : undefined;
      const earlierAction = resolved.some(
        ({ index }) =>
          index < (independent?.index ?? -1) &&
          entries[index]?.id !== claim.independentRead,
      );
      if (
        !independent ||
        !cited.has(claim.independentRead!) ||
        !earlierAction ||
        !stepPassed(independent.entry) ||
        !independentReadComplete(run, independent.entry)
      ) {
        findings.push({
          code: "INDEPENDENT_READ_MISSING",
          message: `Side-effect claim ${claim.id} needs a later successful read that observes completed state; a write request or HTTP 202 acceptance is not an independent read.`,
        });
      }
    }
  }
  for (const claim of plan.claims) {
    if (claim.required && rows.get(claim.id)?.outcome !== "passed") {
      const outcome = rows.get(claim.id)?.outcome ?? "missing";
      findings.push({
        code: "CLAIM_INCOMPLETE",
        message: `Required claim ${claim.id} is ${outcome}.`,
      });
    }
  }
  validateGates(run, plan, result, entries, findings);
}

/**
 * A gate can cite steps from another run of the repository, such as one gate
 * run shared by several journeys, but only from the same source identity.
 */
function validateGates(
  run: Run,
  plan: Plan,
  result: Result,
  entries: Step[],
  findings: Finding[],
): void {
  const ownSteps = new Map(entries.map((entry) => [entry.id, entry]));
  const plannedGates = new Set(plan.gates);
  const seenGates = new Set<string>();
  for (const gate of result.gates) {
    if (!plannedGates.has(gate.name))
      findings.push({
        code: "UNKNOWN_GATE",
        message: `Result names unplanned gate ${gate.name}.`,
      });
    if (seenGates.has(gate.name))
      findings.push({
        code: "DUPLICATE_GATE",
        message: `Result lists gate ${gate.name} more than once.`,
      });
    seenGates.add(gate.name);
    let gateSteps = ownSteps;
    let citedRun: Run | undefined;
    if (gate.run && gate.run !== run.id) {
      const cited = citedGateRun(run, gate.name, gate.run, findings);
      if (!cited) continue;
      [citedRun, gateSteps] = cited;
    }
    for (const id of gate.steps)
      if (!gateSteps.has(id))
        findings.push({
          code: "MISSING_STEP",
          message: `Gate ${gate.name} names missing step ${id}.`,
        });
    const proof = gate.steps.map((id) => gateSteps.get(id));
    if (
      gate.outcome === "passed" &&
      (!proof.length || proof.some((step) => !step || !stepPassed(step)))
    ) {
      findings.push({
        code: "GATE_PROOF_MISSING",
        message: `Passed gate ${gate.name} needs successful recorded steps.`,
      });
    }
    if (
      gate.run &&
      gate.run !== run.id &&
      proof.some(
        (step) =>
          step &&
          (step.source?.hash !== run.source.hash ||
            step.source?.commit !== run.source.commit),
      )
    )
      findings.push({
        code: "STEP_SOURCE_MISMATCH",
        message: `Gate ${gate.name} cites run ${gate.run} on a different source identity than run ${run.id}.`,
      });
    if (citedRun) {
      const differs = differentOverrides(citedRun, run);
      const stored = citedRun.rawProfile;
      const raw =
        stored && hash(JSON.stringify(stored)) === citedRun.profileHash
          ? stored
          : profileAsHashed(citedRun);
      if (!raw && differs.length)
        findings.push({
          code: "STEP_SOURCE_MISMATCH",
          message: `Gate ${gate.name} cites run ${citedRun.id}, whose profile file is no longer the one it hashed, so every changed binding counts: ${differs.join(", ")}.`,
        });
      else if (raw)
        for (const step of proof)
          if (step)
            for (const name of readBindings(raw, citedRun, run, step, differs))
              findings.push({
                code: "STEP_SOURCE_MISMATCH",
                message: `Gate ${gate.name} cites run ${citedRun.id} whose step ${step.id} used binding ${name} with a different value than run ${run.id}.`,
              });
    }
  }
  for (const gate of plan.gates) {
    if (
      !result.gates.some(
        (item) => item.name === gate && item.outcome === "passed",
      )
    )
      findings.push({
        code: "GATE_INCOMPLETE",
        message: `Required repository gate ${gate} is not passed.`,
      });
  }
}

function citedGateRun(
  run: Run,
  gate: string,
  id: string,
  findings: Finding[],
): [Run, Map<string, Step>] | undefined {
  try {
    const cited = loadRun(run.repo, id);
    if (cited.profileHash !== run.profileHash)
      findings.push({
        code: "STEP_SOURCE_MISMATCH",
        message: `Gate ${gate} cites run ${id} with a different profile than run ${run.id}.`,
      });
    if (!existsSync(cited.evidence))
      findings.push({
        code: "GATE_PROOF_MISSING",
        message: `Gate ${gate} cites run ${id}, whose evidence folder ${cited.evidence} no longer exists.`,
      });
    const citedEntries = steps(cited);
    const changed: Finding[] = [];
    artifactInventory(cited, citedEntries, changed);
    if (changed.length)
      findings.push({
        code: "GATE_PROOF_MISSING",
        message: `Gate ${gate} cites run ${id}, whose evidence is missing or changed.`,
      });
    return [cited, new Map(citedEntries.map((entry) => [entry.id, entry]))];
  } catch (error) {
    findings.push({
      code: "GATE_PROOF_MISSING",
      message: `Gate ${gate} cites run ${id}, which cannot be read: ${String(error)}`,
    });
    return undefined;
  }
}

/**
 * The CLI binding overrides that differ between two runs. Overrides are
 * compared as given, before templates: a per-run value such as app_${run}
 * differs in every run without changing what the gate checked.
 */
function differentOverrides(cited: Run, run: Run): string[] {
  const given = (item: Run, name: string) => item.bindingOverrides?.[name];
  const names = new Set([
    ...Object.keys(cited.bindingOverrides ?? {}),
    ...Object.keys(run.bindingOverrides ?? {}),
  ]);
  return [...names].filter((name) => given(cited, name) !== given(run, name));
}

/**
 * Of the changed overrides, those that the cited step read. Every step reads
 * the bindings of a launch that Spyglass owns, because they configure the app
 * the step could reach. An `exec` command runs as given and reads no other
 * binding. A named check also reads the bindings its definition names,
 * directly or through other bindings, override values, `web`, `api` or
 * `evidence`. Any other step reads every binding.
 */
function readBindings(
  raw: Profile,
  cited: Run,
  run: Run,
  step: Step,
  differs: string[],
): string[] {
  const derived: Record<string, unknown> = {
    ...raw.bindings,
    web: raw.web,
    api: raw.api,
    evidence: raw.evidence,
  };
  const read = new Set<string>();
  const visit = (value: unknown) => {
    for (const [, name] of JSON.stringify(value ?? "").matchAll(
      /\$\{([A-Za-z_][\w]*)\}/g,
    ))
      if (name && !read.has(name)) {
        read.add(name);
        visit([
          derived[name],
          cited.bindingOverrides?.[name],
          run.bindingOverrides?.[name],
        ]);
      }
  };
  if (raw.launch.mode === "owned")
    visit({ command: raw.launch.command, env: raw.launch.env });
  if (step.command === "check") {
    const check = raw.checks[step.args[0] ?? ""];
    if (!check) return differs;
    visit(check);
  } else if (step.command !== "exec") return differs;
  return differs.filter((name) => read.has(name));
}

/**
 * A run from 1.1.0 kept only its profile after templates, so the binding names
 * come from its profile file, if that is still the one it hashed.
 */
function profileAsHashed(run: Run): Profile | undefined {
  try {
    const raw = loadProfile(run.profilePath);
    return hash(JSON.stringify(raw)) === run.profileHash ? raw : undefined;
  } catch {
    return undefined;
  }
}

function isImageArtifact(artifact: Artifact): boolean {
  return artifact.kind === "image" || /\.(?:png|jpe?g)$/i.test(artifact.path);
}

function administrativeStep(run: Run, step: Step): boolean {
  if (
    [
      "up",
      "down",
      "doctor",
      "status",
      "mark",
      "logs",
      "ps",
      "result",
      "report",
      "evidence",
      "artifact",
    ].includes(step.command)
  )
    return true;
  if (step.command === "check") {
    const name = typeof step.data.check === "string" ? step.data.check : "";
    return Boolean(name && run.profile.checks[name]?.cleanup);
  }
  return false;
}

function reportsIncompleteState(value: unknown): boolean {
  if (typeof value === "string")
    return /(?:^|[\s"':,])(?:pending|queued|processing|in[_ -]?progress|running|accepted|scheduled|incomplete)(?:$|[\s"':,])/i.test(
      value,
    );
  if (Array.isArray(value)) return value.some(reportsIncompleteState);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) =>
      (/^(?:status|state)$/i.test(key) &&
        typeof item === "string" &&
        /^(?:pending|queued|processing|in[_ -]?progress|running|accepted|scheduled|incomplete)$/i.test(
          item,
        )) ||
      reportsIncompleteState(item),
  );
}

function independentReadComplete(run: Run, step: Step): boolean {
  if (step.command === "api") {
    const method =
      typeof step.data.method === "string"
        ? step.data.method.toUpperCase()
        : step.args[0]?.toUpperCase();
    const status = step.data.status;
    return (
      method === "GET" &&
      typeof status === "number" &&
      status >= 200 &&
      status < 300 &&
      status !== 202 &&
      !reportsIncompleteState(step.data.body)
    );
  }
  if (step.command === "db") {
    const sql =
      typeof step.data.sql === "string" ? step.data.sql : (step.args[0] ?? "");
    return (
      /^(?:select|with|values|table|show|explain)\b/i.test(sql.trimStart()) &&
      step.data.truncated !== true
    );
  }
  return !administrativeStep(run, step);
}

function stepPassed(step: Step): boolean {
  return (
    step.exitCode === 0 &&
    (step.commandExitCode ?? 0) === 0 &&
    !step.data?.error &&
    step.data?.passed !== false &&
    step.data?.timedOut !== true &&
    step.data?.overall !== false &&
    !hasImportErrors(step) &&
    !hasFailedAssertion(step) &&
    !hasSkip(step)
  );
}

function hasImportErrors(step: Step): boolean {
  return (
    Array.isArray(step.data?.importErrors) && step.data.importErrors.length > 0
  );
}

function hasFailedAssertion(step: Step): boolean {
  const claims = step.data?.claims;
  return (
    Array.isArray(claims) &&
    claims.some((value) =>
      Boolean(
        value &&
        typeof value === "object" &&
        (value as Record<string, unknown>).ok === false,
      ),
    )
  );
}

function hasSkip(step: Step): boolean {
  return Array.isArray(step.data?.skips) && step.data.skips.length > 0;
}

function assertion(step: Step | undefined, id: string): boolean | undefined {
  const claims = step?.data?.claims;
  if (!Array.isArray(claims)) return undefined;
  const row = claims.find(
    (value) =>
      value &&
      typeof value === "object" &&
      String((value as Record<string, unknown>).id) === id,
  ) as Record<string, unknown> | undefined;
  return typeof row?.ok === "boolean" ? row.ok : undefined;
}

function validateControls(
  run: Run,
  result: Result | undefined,
  entries: Step[],
  findings: Finding[],
) {
  const planned = run.plan.controls ?? [];
  const submitted = result?.controls ?? [];
  const stepMap = new Map(
    entries.map((entry, index) => [entry.id, { entry, index }]),
  );
  const resultClaims = new Map(
    result?.claims.map((claim) => [claim.id, claim]) ?? [],
  );
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];

  for (const control of submitted) {
    const spec = planned.find((item) => item.id === control.id);
    if (!spec) {
      findings.push({
        code: "UNKNOWN_CONTROL",
        message: `Result names undeclared negative control ${control.id}.`,
      });
      rows.push({ ...control, outcome: "invalid" });
      continue;
    }
    if (seen.has(control.id))
      findings.push({
        code: "DUPLICATE_CONTROL",
        message: `Result lists negative control ${control.id} more than once.`,
      });
    seen.add(control.id);
    let baseline = run;
    let baselineEntries = entries;
    const problems: string[] = [];
    if (!control.observedFailure.trim() || !control.observedPass.trim())
      problems.push(
        "record observations for both the failed and restored attempts",
      );
    if (control.failedRun && control.failedRun !== run.id) {
      try {
        baseline = loadRun(run.repo, control.failedRun);
        if (!existsSync(baseline.evidence))
          problems.push(
            `the failed run's evidence folder ${baseline.evidence} no longer exists; keep its worktree until this report`,
          );
        baselineEntries = steps(baseline);
        const oldSpec = baseline.plan.controls.find(
          (item) => item.id === spec.id,
        );
        if (JSON.stringify(oldSpec) !== JSON.stringify(spec))
          problems.push(
            "baseline and candidate must declare the same control expectation",
          );
        if (
          baseline.plan.claims.find((item) => item.id === spec.claim)
            ?.expected !==
          run.plan.claims.find((item) => item.id === spec.claim)?.expected
        )
          problems.push("baseline and candidate claim expectations differ");
        if (!baseline.cleanup || !baseline.ownerCleaned)
          problems.push("baseline cleanup is incomplete");
        const baselineFindings: Finding[] = [];
        artifactInventory(baseline, baselineEntries, baselineFindings);
        if (baselineFindings.length)
          problems.push("baseline evidence is missing or changed");
      } catch (error) {
        problems.push(`cannot read baseline: ${String(error)}`);
      }
    }
    const failedIndex = baselineEntries.findIndex(
      (item) => item.id === control.failedStep,
    );
    const failed =
      failedIndex < 0
        ? undefined
        : { entry: baselineEntries[failedIndex]!, index: failedIndex };
    const restored = stepMap.get(control.restoredStep);
    const claim = resultClaims.get(spec.claim);
    if (control.failedStep === control.restoredStep)
      problems.push("the failed and restored steps must be different");
    if (!failed) problems.push(`failed step ${control.failedStep} is missing`);
    if (!restored)
      problems.push(`restored step ${control.restoredStep} is missing`);
    if (failed && restored) {
      if (
        baseline.id === run.id
          ? failed.index >= restored.index
          : Date.parse(failed.entry.startedAt) >=
            Date.parse(restored.entry.startedAt)
      )
        problems.push("the restored pass must follow the failed attempt");
      for (const [label, step] of [
        ["failed", failed.entry],
        ["restored", restored.entry],
      ] as const) {
        const expectedSource =
          label === "failed" ? baseline.source : run.source;
        if (
          !step.source?.hash ||
          step.source.hash !== expectedSource.hash ||
          step.source.commit !== expectedSource.commit
        )
          problems.push(`${label} step uses a different source identity`);
      }
      if (spec.command && spec.failure && !spec.assertion) {
        for (const [label, step] of [
          ["failed", failed.entry],
          ["restored", restored.entry],
        ] as const) {
          if (
            JSON.stringify([step.command, ...step.args]) !==
            JSON.stringify(spec.command)
          )
            problems.push(`${label} step does not run the declared command`);
        }
        const error = failed.entry.data.error as { code?: string } | undefined;
        if (
          stepPassed(failed.entry) ||
          error?.code !== spec.failure.code ||
          !JSON.stringify(failed.entry.data).includes(spec.failure.contains)
        )
          problems.push("failed command does not show the declared failure");
        if (!stepPassed(restored.entry))
          problems.push("restored command did not pass");
      } else if (spec.assertion && !spec.command && !spec.failure) {
        if (assertion(failed.entry, spec.assertion) !== false)
          problems.push(
            `failed step does not show declared assertion ${spec.assertion} failing`,
          );
        if (
          assertion(restored.entry, spec.assertion) !== true ||
          !stepPassed(restored.entry)
        )
          problems.push(
            `restored step does not show declared assertion ${spec.assertion} passing`,
          );
      } else
        problems.push(
          "declare either an assertion or a command with an expected failure",
        );
    }
    if (
      !claim ||
      claim.outcome !== "passed" ||
      !claim.steps.includes(control.restoredStep)
    )
      problems.push(
        `claim ${spec.claim} does not cite the restored passing step`,
      );
    if (problems.length)
      findings.push({
        code: "CONTROL_INVALID",
        message: `Negative control ${control.id} is invalid: ${problems.join("; ")}.`,
      });
    rows.push({
      ...control,
      ...spec,
      baseline: {
        run: baseline.id,
        source: baseline.source.hash,
        evidence: baseline.evidence,
      },
      outcome: problems.length ? "failed" : "passed",
    });
  }
  for (const control of planned) {
    if (!run.plan.claims.some((claim) => claim.id === control.claim))
      findings.push({
        code: "CONTROL_UNKNOWN_CLAIM",
        message: `Negative control ${control.id} refers to unknown claim ${control.claim}.`,
      });
    if (!seen.has(control.id)) {
      findings.push({
        code: "CONTROL_INCOMPLETE",
        message: `Required negative control ${control.id} has no failed-then-restored result.`,
      });
      rows.push({ ...control, outcome: "not run" });
    }
  }
  return rows;
}

function htmlEscape(value: unknown, ctx: Context): string {
  const text = ctx.vault.text(
    typeof value === "string" ? value : String(value ?? ""),
  );
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonText(value: unknown, ctx: Context): string {
  return JSON.stringify(ctx.vault.clean(value), null, 2);
}

function readableArtifact(item: VerifiedArtifact, ctx: Context): string {
  const path = htmlEscape(item.artifact.path, ctx);
  const digest = htmlEscape(item.artifact.sha256, ctx);
  const kind = htmlEscape(item.artifact.kind, ctx);
  const producer = htmlEscape(item.artifact.step, ctx);
  if (!item.valid)
    return `<li><strong>${path}</strong> — ${htmlEscape(item.message ?? "invalid", ctx)}</li>`;
  if (item.imageData && item.mime)
    return `<li><p><strong>${path}</strong> · ${kind} · SHA-256 ${digest} · step ${producer}</p><img alt="Evidence image ${path}" src="data:${item.mime};base64,${item.imageData}"></li>`;
  const excerpt =
    item.textData === undefined
      ? ""
      : ctx.vault.text(item.textData).slice(0, 65536);
  const body = excerpt
    ? `<details><summary>Inspect text evidence</summary><pre>${htmlEscape(excerpt, ctx)}${item.textData!.length > excerpt.length ? "\n[Preview shortened; the evidence file is retained in this folder.]" : ""}</pre></details>`
    : "";
  return `<li><strong>${path}</strong> · ${kind} · SHA-256 ${digest} · step ${producer}${body}</li>`;
}

function renderHtml(
  summary: Record<string, unknown>,
  inventory: VerifiedArtifact[],
  ctx: Context,
): string {
  const claims = summary.claims as Array<Record<string, unknown>>;
  const gates = summary.gates as Array<Record<string, unknown>>;
  const controls = summary.controls as Array<Record<string, unknown>>;
  const attempts = summary.attempts as Array<Record<string, unknown>>;
  const env = summary.environment as Array<Record<string, unknown>>;
  const visuals = summary.visualObservations as Array<Record<string, unknown>>;
  const cleanup = summary.cleanup as Record<string, unknown>;
  const limits = summary.limits as string[];
  const claimHtml = claims
    .map(
      (item) =>
        `<article><h3>${htmlEscape(item.id, ctx)} · ${htmlEscape(item.outcome, ctx)}</h3><p><strong>Behavior:</strong> ${htmlEscape(item.behavior, ctx)}</p><p><strong>Entry point:</strong> ${htmlEscape(item.entryPoint, ctx)}<br><strong>Precondition:</strong> ${htmlEscape(item.precondition, ctx)}<br><strong>Expected:</strong> ${htmlEscape(item.expected, ctx)}</p><p><strong>Observed:</strong> ${htmlEscape(item.observed, ctx)}</p><p><strong>Steps:</strong> ${htmlEscape((item.steps as string[]).join(", ") || "none", ctx)}<br><strong>Evidence:</strong> ${htmlEscape((item.artifacts as string[]).join(", ") || "none", ctx)}</p>${item.reason ? `<p><strong>Reason:</strong> ${htmlEscape(item.reason, ctx)}</p>` : ""}</article>`,
    )
    .join("\n");
  const gateHtml =
    gates
      .map(
        (item) =>
          `<li>${htmlEscape(item.name, ctx)} · ${htmlEscape(item.outcome, ctx)} · steps ${htmlEscape((item.steps as string[]).join(", ") || "none", ctx)}</li>`,
      )
      .join("\n") || "<li>No repository gates are selected.</li>";
  const controlHtml =
    controls
      .map(
        (item) =>
          `<article><h3>${htmlEscape(item.id, ctx)} · ${htmlEscape(item.outcome, ctx)}</h3><p><strong>Claim:</strong> ${htmlEscape(item.claim, ctx)}<br><strong>Expectation:</strong> ${htmlEscape(item.expectation, ctx)}<br><strong>Assertion:</strong> ${htmlEscape(item.assertion, ctx)}</p><p><strong>Failed attempt:</strong> ${htmlEscape(item.failedStep ?? "none", ctx)} — ${htmlEscape(item.observedFailure ?? "not recorded", ctx)}<br><strong>Restored pass:</strong> ${htmlEscape(item.restoredStep ?? "none", ctx)} — ${htmlEscape(item.observedPass ?? "not recorded", ctx)}</p></article>`,
      )
      .join("\n") || "<p>No negative controls are selected.</p>";
  const envHtml = env
    .map(
      (item) =>
        `<li><strong>${htmlEscape(item.name, ctx)}:</strong> ${htmlEscape(item.status, ctx)} — ${htmlEscape(item.detail, ctx)}</li>`,
    )
    .join("\n");
  const attemptHtml =
    attempts
      .map(
        (item) =>
          `<details><summary>${htmlEscape(item.startedAt, ctx)} · ${htmlEscape(item.command, ctx)} · ${htmlEscape(item.status, ctx)} · child exit ${htmlEscape(item.exitCode, ctx)} · step ${htmlEscape(item.id, ctx)}</summary><p>Arguments: ${htmlEscape(JSON.stringify(item.args), ctx)}<br>Source: ${htmlEscape((item.source as Record<string, unknown>)?.hash, ctx)}<br>Artifacts: ${htmlEscape(((item.artifacts as Artifact[]) ?? []).map((value) => value.path).join(", ") || "none", ctx)}</p><pre>${htmlEscape(JSON.stringify(item.data, null, 2), ctx)}</pre></details>`,
      )
      .join("\n") || "<p>No attempts are recorded.</p>";
  const visualHtml =
    visuals
      .map(
        (item) =>
          `<article><h3>${htmlEscape(item.id, ctx)}</h3><p><strong>Viewport:</strong> ${htmlEscape(item.viewport, ctx)}<br><strong>Expected:</strong> ${htmlEscape(item.expected, ctx)}<br><strong>Observed:</strong> ${htmlEscape(item.observed, ctx)}<br><strong>Screenshots:</strong> ${htmlEscape((item.artifacts as string[]).join(", "), ctx)}</p></article>`,
      )
      .join("\n") || "<p>No visual observations are recorded.</p>";
  const artifactHtml =
    inventory.map((item) => readableArtifact(item, ctx)).join("\n") ||
    "<li>No artifacts are recorded.</li>";
  const limitHtml =
    limits.map((value) => `<li>${htmlEscape(value, ctx)}</li>`).join("\n") ||
    "<li>No coverage limits recorded.</li>";
  const cleanupHtml = Object.entries(cleanup)
    .map(
      ([key, value]) =>
        `<li><strong>${htmlEscape(key, ctx)}:</strong> ${htmlEscape(value, ctx)}</li>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spyglass report ${htmlEscape(summary.run, ctx)}</title><style>
:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{max-width:1100px;margin:2rem auto;padding:0 1rem}h1,h2{line-height:1.2}article,details,section{border:1px solid #8886;border-radius:.5rem;padding:1rem;margin:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:32rem;overflow:auto;background:#8881;padding:.75rem}img{max-width:100%;height:auto;border:1px solid #8886}code{overflow-wrap:anywhere}.status{font-size:1.2rem;font-weight:700}li{margin:.5rem 0}
</style></head><body>
<header><h1>Spyglass verification report</h1><p class="status">${htmlEscape(summary.status, ctx)}</p><p>Run ${htmlEscape(summary.run, ctx)} · ${htmlEscape(summary.app, ctx)} · operator ${htmlEscape(summary.operator ?? "not recorded", ctx)}</p><p>Source commit ${htmlEscape((summary.source as Record<string, unknown>)?.commit, ctx)} · fingerprint ${htmlEscape((summary.source as Record<string, unknown>)?.hash, ctx)}</p></header>
<section><h2>Behavioral claims</h2>${claimHtml || "<p>No claims are in the plan.</p>"}</section>
<section><h2>Repository gates</h2><ul>${gateHtml}</ul></section>
<section><h2>Negative controls</h2>${controlHtml}</section>
<section><h2>Environment checks</h2><ul>${envHtml}</ul></section>
<section><h2>Visual observations</h2>${visualHtml}</section>
<section><h2>Cleanup</h2><ul>${cleanupHtml}</ul></section>
<section><h2>Coverage limits</h2><ul>${limitHtml}</ul></section>
<section><h2>Attempts</h2>${attemptHtml}</section>
<section><h2>Artifacts</h2><ul>${artifactHtml}</ul></section>
<section><h2>Report data</h2><details><summary>Machine-readable summary</summary><pre>${htmlEscape(jsonText(summary, ctx), ctx)}</pre></details></section>
</body></html>\n`;
}

function renderClaims(plan: Plan, result: Result | undefined) {
  const rows = new Map(result?.claims.map((claim) => [claim.id, claim]) ?? []);
  return plan.claims.map((claim) => {
    const row = rows.get(claim.id);
    return {
      id: claim.id,
      kind: claim.kind,
      required: claim.required,
      outcome: row?.outcome ?? "not run",
      behavior: claim.behavior,
      entryPoint: claim.entryPoint,
      precondition: claim.precondition,
      expected: claim.expected,
      case: claim.case,
      checks: claim.checks,
      requiredEvidence: claim.evidence,
      steps: row?.steps ?? [],
      observed: row?.observed ?? "",
      artifacts: row?.artifacts ?? [],
      inspection: row?.inspection,
      inspections: row?.inspections ?? [],
      independentRead: row?.independentRead,
      reason: row?.reason,
    };
  });
}

function attemptsFor(
  entries: Step[],
  ctx: Context,
): Array<Record<string, unknown>> {
  return entries.map((entry) =>
    ctx.vault.clean({
      id: entry.id,
      command: entry.command,
      args: entry.args,
      startedAt: entry.startedAt,
      durationMs: entry.durationMs,
      exitCode: entry.exitCode,
      commandExitCode: entry.commandExitCode ?? (stepPassed(entry) ? 0 : 1),
      status: stepPassed(entry) ? "passed" : "failed",
      source: entry.source,
      artifacts: entry.artifacts,
      data: entry.data,
    }),
  );
}

function collectFindings(
  ctx: Context,
  result: Result | undefined,
  entries: Step[],
  inventory: VerifiedArtifact[],
  sourceChanged: string[],
  sourceError: string | undefined,
): Finding[] {
  const findings: Finding[] = [];
  if (!result)
    findings.push({
      code: "RESULT_MISSING",
      message:
        "No result has been recorded for this run. Submit it with spyglass result --file PATH.",
    });
  if (!ctx.run.plan.claims.length)
    findings.push({
      code: "PLAN_EMPTY",
      message: "The run has no claim matrix.",
    });
  if (sourceError)
    findings.push({ code: "SOURCE_UNAVAILABLE", message: sourceError });
  if (sourceChanged.length)
    findings.push({
      code: "STALE_SOURCE",
      message: `Source changed since up: ${sourceChanged.join(", ")}.`,
    });
  for (const entry of entries) {
    if (!entry.source?.hash || !entry.source?.commit)
      findings.push({
        code: "STEP_SOURCE_MISSING",
        message: `Step ${entry.id} has no source identity.`,
      });
    else if (
      entry.source.hash !== ctx.run.source.hash ||
      entry.source.commit !== ctx.run.source.commit
    )
      findings.push({
        code: "STEP_SOURCE_MISMATCH",
        message: `Step ${entry.id} used a different source identity.`,
      });
  }
  if (result)
    validateClaimProof(
      ctx.run,
      ctx.run.plan,
      result,
      entries,
      inventory,
      findings,
    );
  if (!ctx.run.cleanup)
    findings.push({
      code: "CLEANUP_PENDING",
      message:
        "Spyglass-owned resources have not been cleaned up successfully.",
    });
  if (ctx.run.profile.launch.mode === "external" && !ctx.run.ownerCleaned)
    findings.push({
      code: "OWNER_CLEANUP_PENDING",
      message: "The external owner has not recorded successful cleanup.",
    });
  return findings;
}

function reportSummary(
  ctx: Context,
  result: Result | undefined,
  entries: Step[],
  inventory: VerifiedArtifact[],
  findings: Finding[],
  currentHash?: string,
  changed: string[] = [],
  sourceError?: string,
): Record<string, unknown> {
  const claims = renderClaims(ctx.run.plan, result);
  const gates = ctx.run.plan.gates.map((name) => {
    const row = result?.gates.find((item) => item.name === name);
    return row ?? { name, outcome: "not run", steps: [] };
  });
  const controls = validateControls(ctx.run, result, entries, findings);
  const visualObservations = claims
    .filter((claim) => claim.kind === "visual")
    .flatMap((claim) => [
      ...(claim.inspection
        ? [{ id: claim.id, ...claim.inspection, artifacts: claim.artifacts }]
        : []),
      ...claim.inspections.map((inspection) => ({
        id: claim.id,
        ...inspection,
        artifacts: [inspection.artifact],
      })),
    ]);
  const limits = [
    ...new Set([...(ctx.run.plan.limits ?? []), ...(result?.limits ?? [])]),
  ];
  const stable = !sourceError && changed.length === 0;
  const cleanup = {
    runState: ctx.run.state,
    spyglassResourcesCleaned: ctx.run.cleanup,
    externalOwnerCleaned:
      ctx.run.profile.launch.mode === "external"
        ? ctx.run.ownerCleaned
        : "not required",
  };
  const environment = [
    {
      name: "source identity",
      status: stable ? "passed" : "failed",
      detail:
        sourceError ??
        (stable
          ? "Current source matches the baseline recorded at up."
          : `Changed inputs: ${changed.join(", ")}`),
    },
    {
      name: "artifact integrity",
      status: inventory.every((item) => item.valid) ? "passed" : "failed",
      detail: `${inventory.filter((item) => item.valid).length} of ${inventory.length} recorded artifacts match their checksums.`,
    },
    {
      name: "cleanup",
      status:
        ctx.run.cleanup &&
        (ctx.run.profile.launch.mode !== "external" || ctx.run.ownerCleaned)
          ? "passed"
          : "pending",
      detail: `Spyglass cleanup: ${ctx.run.cleanup}; external owner cleanup: ${ctx.run.ownerCleaned}.`,
    },
  ];
  return ctx.vault.clean({
    schemaVersion: 1,
    status: findings.length ? "incomplete" : "passed",
    complete: findings.length === 0,
    run: ctx.run.id,
    app: ctx.run.profile.app,
    operator: result?.operator,
    generatedAt: new Date().toISOString(),
    source: {
      commit: ctx.run.source.commit,
      hash: ctx.run.source.hash,
      currentHash,
      changed,
      error: sourceError,
    },
    claims,
    gates,
    controls,
    environment,
    visualObservations,
    cleanup,
    limits,
    attempts: attemptsFor(entries, ctx),
    artifacts: inventory.map((item) => ({
      ...item.artifact,
      valid: item.valid,
      sourceStep: item.step,
      message: item.message,
    })),
    findings,
  });
}

// Only a result recorded through `result` counts. An edited template on disk
// has not passed the proof validation that `result` applies.
function parseRunResult(run: Run, findings: Finding[]): Result | undefined {
  if (!run.result) return undefined;
  try {
    return validate(resultSchema, run.result, "result");
  } catch (error) {
    findings.push({
      code: "RESULT_INVALID",
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export async function report(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  const command = args[0];
  let result: Result | undefined;
  if (command === "result") {
    const file = requiredValue(args, "--file");
    if (args.length !== 3 || args[1] !== "--file")
      throw new Fault(
        "INVALID_USAGE",
        "result accepts only --file PATH.",
        "Run spyglass result --file PATH.",
      );
    result = validate(resultSchema, readResultFile(file), "result");
    const entries = steps(ctx.run);
    const early: Finding[] = [];
    const inventory = artifactInventory(ctx.run, entries, early);
    validateClaimProof(
      ctx.run,
      ctx.run.plan,
      result,
      entries,
      inventory,
      early,
    );
    const controls = validateControls(ctx.run, result, entries, early);
    const invalidMatrix = early.find((item) =>
      [
        "UNKNOWN_CLAIM",
        "DUPLICATE_CLAIM",
        "UNKNOWN_GATE",
        "DUPLICATE_GATE",
      ].includes(item.code),
    );
    if (invalidMatrix)
      throw new Fault(
        "INVALID_RESULT",
        invalidMatrix.message,
        "Use claim and gate IDs from the run plan, once each.",
        2,
        { findings: early },
      );
    const proofFailure = early.find((item) =>
      [
        "MISSING_STEP",
        "FAILED_STEP",
        "FAILED_ASSERTION",
        "MISSING_EVIDENCE",
        "INVALID_EVIDENCE",
        "ARTIFACT_PRODUCER_MISMATCH",
        "OBSERVATION_MISSING",
        "NAMED_CHECK_MISSING",
        "NAMED_CHECK_FAILED",
        "BEHAVIOR_PROOF_MISSING",
        "BEHAVIOR_EVIDENCE_MISSING",
        "VISUAL_INSPECTION_MISSING",
        "VISUAL_IMAGE_MISSING",
        "INDEPENDENT_READ_MISSING",
        "GATE_PROOF_MISSING",
        "STEP_SOURCE_MISSING",
        "STEP_SOURCE_MISMATCH",
        "CONTROL_INVALID",
        "CONTROL_UNKNOWN_CLAIM",
      ].includes(item.code),
    );
    if (proofFailure)
      throw new Fault(
        "PROOF_INCOMPLETE",
        proofFailure.message,
        "Record a successful step and its retained evidence, inspect visual evidence when required, then submit the result again.",
        1,
        { findings: early },
      );
    ctx.run.result = ctx.vault.clean(result);
    return {
      recorded: true,
      operator: result.operator,
      claims: result.claims.length,
      gates: result.gates.length,
      controls: controls.length,
      resultPath: ctx.run.resultPath,
    };
  }
  if (command !== "report" || args.length !== 1)
    throw new Fault(
      "INVALID_USAGE",
      `Unsupported report command ${args.join(" ")}.`,
      "Run spyglass result --file PATH or spyglass report.",
    );

  const findings: Finding[] = [];
  result = parseRunResult(ctx.run, findings);
  let entries: Step[] = [];
  try {
    entries = steps(ctx.run);
  } catch (error) {
    findings.push({
      code: "LOG_INVALID",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const inventory = artifactInventory(ctx.run, entries, findings);
  let changed: string[] = [];
  let currentHash: string | undefined;
  let sourceError: string | undefined;
  try {
    const current = source(ctx.run.repo, ctx.run.profile);
    currentHash = current.hash;
    changed = [
      ...(current.commit !== ctx.run.source.commit
        ? ["Git commit changed"]
        : []),
      ...[
        ...new Set([
          ...Object.keys(current.files),
          ...Object.keys(ctx.run.source.files),
        ]),
      ].filter((path) => current.files[path] !== ctx.run.source.files[path]),
    ];
  } catch (error) {
    sourceError = error instanceof Error ? error.message : String(error);
  }
  findings.push(
    ...collectFindings(ctx, result, entries, inventory, changed, sourceError),
  );
  const beforeHtml = reportSummary(
    ctx,
    result,
    entries,
    inventory,
    findings,
    currentHash,
    changed,
    sourceError,
  );
  const html = renderHtml(beforeHtml, inventory, ctx);
  const page = ctx.artifact("index.html", Buffer.from(html), "report");
  const summary = {
    ...beforeHtml,
    report: {
      page: { path: page.path, sha256: page.sha256 },
      summary: {
        path: `${ctx.step.id}-${ctx.step.artifacts.length + 1}-summary.json`,
      },
    },
  };
  const summaryArtifact = ctx.artifact(
    "summary.json",
    summary,
    "report-summary",
  );
  const {
    attempts: _attempts,
    artifacts: _artifacts,
    ...brief
  } = summary as Record<string, unknown>;
  const finalData = {
    ...brief,
    attemptCount: entries.length,
    artifactCount: inventory.length,
    report: { page, summary: summaryArtifact },
    reportPath: join(ctx.run.evidence, "spyglass", page.path),
  };
  if (findings.length) {
    const first = findings[0]!;
    throw new Fault(
      "REPORT_INCOMPLETE",
      `Report is incomplete: ${first.message}`,
      "Inspect the retained report and findings; complete the required proof, clean up resources, or record a coverage limit.",
      1,
      finalData,
    );
  }
  return finalData;
}
