// Executable public recipe. Adapt the profile, plan and observations for a target.
// This script does not select acceptance conditions for an arbitrary repository.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scenario = process.argv[2] ?? "passed";
if (!["passed", "incomplete"].includes(scenario))
  throw new Error("Use passed or incomplete.");
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const run = `ci-${scenario}-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`;
const output = resolve(".spyglass/ci-delivery", scenario);
mkdirSync(output, { recursive: true });
const calls = [];
let allocated = false;
let runMayExist = false;
let intentionalInterruption = false;
const intendedStop = new Error(
  "Intentional interruption after the validated fixture failure.",
);
let problem;
let report;
function call(args) {
  const child = spawnSync(
    process.execPath,
    [cli, "--json", "--run", run, ...args],
    { encoding: "utf8", timeout: 120000 },
  );
  const record = {
    args,
    exitCode: child.status,
    signal: child.signal,
    stdout: child.stdout,
    stderr: child.stderr,
    error: child.error?.message,
  };
  // Persist raw diagnostics before parsing: truncated JSON is still an attempt.
  calls.push(record);
  writeFileSync(
    join(output, "commands.json"),
    JSON.stringify(calls, null, 2) + "\n",
  );
  let envelope;
  try {
    envelope = JSON.parse(child.stdout ?? "");
    record.envelope = envelope;
  } catch (error) {
    record.parseError = String(error);
  }
  writeFileSync(
    join(output, "commands.json"),
    JSON.stringify(calls, null, 2) + "\n",
  );
  return { code: child.status, ...envelope };
}
function requirePass(value) {
  if (value.code !== 0 || value.ok !== true)
    throw new Error(JSON.stringify(value));
  return value;
}
try {
  const absent = call(["status"]);
  if (absent.error?.code !== "UNKNOWN_RUN")
    throw new Error(
      "The exact run ID is not confirmed absent; refusing to reuse it.",
    );
  runMayExist = true;
  const up = call([
    "up",
    "--profile",
    "examples/ci.profile.json",
    "--plan",
    "examples/ci.plan.json",
  ]);
  allocated = Boolean(up.run);
  requirePass(up);
  // This delivery is self-contained: run its gate here, not from an automatic
  // earlier-run citation. Result validation still requires the planned gate.
  const pendingPath = up.data.resultPath ?? up.data.result;
  const pending = JSON.parse(readFileSync(pendingPath, "utf8"));
  pending.gates = [];
  writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + "\n");
  writeFileSync(".spyglass/ci-fault", "intended fixture failure\n");
  const failed = call(["check", "verify", "--control", "detect-fault:failed"]);
  if (
    failed.code !== 1 ||
    failed.error?.code !== "CHECK_FAILED" ||
    !failed.data?.claims?.some(
      (row) => row.id === "fixture-ready" && row.ok === false,
    )
  ) {
    throw new Error("The intended fixture assertion did not fail.");
  }
  rmSync(".spyglass/ci-fault");
  if (scenario === "incomplete") {
    intentionalInterruption = true;
    throw intendedStop;
  }
  const restored = requirePass(
    call([
      "check",
      "verify",
      "--claim",
      "fixture-ready",
      "--control",
      "detect-fault:restored",
      "--gate",
      "verify",
    ]),
  );
  if (
    !restored.data.claims.some(
      (row) => row.id === "fixture-ready" && row.ok === true,
    )
  )
    throw new Error("Restored assertion is missing.");
  requirePass(
    call([
      "result",
      "set",
      "--claim",
      "fixture-ready",
      "--outcome",
      "passed",
      "--observed",
      "The unchanged fixture-ready assertion passed after the fault marker was removed.",
    ]),
  );
  requirePass(
    call([
      "result",
      "set",
      "--control",
      "detect-fault",
      "--observed-failure",
      "The fixture-ready assertion was false with the marker present.",
      "--observed-pass",
      "The same assertion was true after removal.",
    ]),
  );
  requirePass(call(["result"]));
  requirePass(call(["doctor"]));
} catch (error) {
  if (error !== intendedStop) problem = String(error);
} finally {
  rmSync(".spyglass/ci-fault", { force: true });
  if (runMayExist && !allocated) {
    const probe = call(["status"]);
    if (probe.ok && probe.run === run) allocated = true;
    else if (probe.error?.code === "UNKNOWN_RUN") runMayExist = false;
    // An uncertain probe still attempts cleanup of this preflight-absent ID.
  }
  if (runMayExist) {
    try {
      requirePass(call(["down"]));
    } catch (error) {
      problem ??= String(error);
    }
    // Do not use finish here: it stops before report when proof is missing.
    try {
      report = call(["report"]);
      // The example's fixed profile owns this path. Keep it even if the report
      // envelope is truncated; diagnostics must not erase already written proof.
      const evidence = resolve(".spyglass/runs", run, "spyglass");
      if (existsSync(evidence))
        cpSync(evidence, join(output, "evidence"), { recursive: true });
      writeFileSync(
        join(output, "report.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
      if (report.data?.reportPath) {
        writeFileSync(
          join(output, "review.md"),
          readFileSync(report.data.reviewPath),
        );
      }
      const expectedIncomplete =
        intentionalInterruption &&
        report.code === 1 &&
        report.error?.code === "REPORT_INCOMPLETE" &&
        report.data?.complete === false;
      if (!expectedIncomplete && (report.code !== 0 || !report.data?.complete))
        problem ??= "Report is incomplete or unavailable.";
    } catch (error) {
      problem ??= String(error);
    }
  }
  const git = (...args) =>
    spawnSync("git", args, { encoding: "utf8" }).stdout?.trim();
  const context = {
    execution:
      process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
    repository: process.env.GITHUB_REPOSITORY ?? null,
    workflowRun: process.env.GITHUB_RUN_ID ?? null,
    workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    event: process.env.GITHUB_EVENT_NAME ?? null,
    workflowSha: process.env.GITHUB_SHA ?? null,
    checkoutCommit: git("rev-parse", "HEAD"),
    candidateHead: process.env.PR_HEAD_SHA ?? null,
    node: process.version,
    run,
    scenario,
    allocated,
    allocationUncertain: runMayExist && !allocated,
    interruption: intentionalInterruption ? "after-intended-failure" : null,
    problem: problem ?? null,
    complete: report?.data?.complete ?? false,
    report: report?.data?.report?.page?.path
      ? `evidence/${report.data.report.page.path}`
      : null,
    summary: report?.data?.report?.summary?.path
      ? `evidence/${report.data.report.summary.path}`
      : null,
    review: report?.data?.report?.review?.path
      ? `evidence/${report.data.report.review.path}`
      : null,
  };
  writeFileSync(
    join(output, "provenance.json"),
    JSON.stringify(context, null, 2) + "\n",
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const heading = `## Scripted CI recipe: ${scenario}\n\nCheckout: ${context.checkoutCommit}\n\nPR head: ${context.candidateHead ?? "not a PR"}\n\n`;
    const review = context.review
      ? readFileSync(join(output, context.review), "utf8")
      : "No report: setup or report generation failed. Read provenance.json and commands.json.\n";
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, heading + review);
  }
  console.log(JSON.stringify(context, null, 2));
}
process.exitCode = problem || intentionalInterruption ? 1 : 0;
