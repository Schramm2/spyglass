import { spawn } from "node:child_process";
import { Fault } from "./errors.js";
import { readJson } from "./files.js";
import { Context, loadRun, steps, type Run, type Step } from "./state.js";
import type { Result } from "./schema.js";

const REPLAYABLE = ["check", "exec", "api", "db", "ui"];

export interface ReplayOptions {
  from: string;
  failedOnly: boolean;
  execute: boolean;
}
interface Planned {
  from: string;
  command: string;
  args: string[];
  claims: string[];
  independentRead: boolean;
  skipped?: string;
}
interface Outcome {
  from: string;
  command: string;
  step?: string;
  status: "passed" | "failed" | "skipped" | "planned" | "not run";
  claims: string[];
  reason?: string;
}

function pendingResult(old: Run): Partial<Result> {
  try {
    return readJson(old.resultPath) as Partial<Result>;
  } catch {
    return (old.result ?? {}) as Partial<Result>;
  }
}
/** The steps of the earlier run that its claims cite, in the order it ran them. */
function plan(old: Run, failedOnly: boolean): Planned[] {
  const result = pendingResult(old);
  const claims = (Array.isArray(result.claims) ? result.claims : []).filter(
    (claim) => !failedOnly || claim.outcome !== "passed",
  );
  const log = steps(old);
  const order = new Map(log.map((step, index) => [step.id, index]));
  const byStep = new Map<string, Planned>();
  for (const claim of claims) {
    const cited = new Set(claim.steps);
    if (claim.independentRead) cited.add(claim.independentRead);
    for (const id of cited) {
      const step: Step | undefined = log.find((entry) => entry.id === id);
      if (!step || !REPLAYABLE.includes(step.command)) continue;
      const row = byStep.get(id) ?? {
        from: id,
        command: step.command,
        args: step.args,
        claims: [],
        independentRead: false,
        ...(step.args.some((arg) => arg.includes("[REDACTED]"))
          ? {
              skipped:
                "an argument holds a masked secret; Spyglass cannot rebuild it",
            }
          : {}),
      };
      row.claims.push(claim.id);
      if (claim.independentRead === id) row.independentRead = true;
      byStep.set(id, row);
    }
  }
  return [...byStep.values()].sort(
    (a, b) => (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0),
  );
}
function argv(item: Planned, run: string): string[] {
  const at = item.args.indexOf("--");
  const head = at < 0 ? item.args : item.args.slice(0, at);
  const tail = at < 0 ? [] : item.args.slice(at);
  return [
    "--json",
    item.command,
    ...head,
    "--run",
    run,
    ...item.claims.flatMap((claim) => ["--claim", claim]),
    ...(item.independentRead ? ["--independent-read"] : []),
    ...tail,
  ];
}
function invoke(
  args: string[],
  cwd: string,
): Promise<{ status: number; step?: string; code?: string; message?: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [process.argv[1]!, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", (status) => {
      try {
        const envelope = JSON.parse(out);
        resolve({
          status: status ?? 1,
          step: envelope.step ?? undefined,
          code: envelope.error?.code,
          message: envelope.error?.message,
        });
      } catch {
        resolve({ status: status ?? 1, message: "No JSON result." });
      }
    });
  });
}
/** Set failedRun and failedStep on the controls that the earlier run failed. */
function linkControls(
  run: Run,
  old: Run,
  cwd: string,
): Promise<string[]> | string[] {
  const earlier = pendingResult(old);
  const ids = (Array.isArray(earlier.controls) ? earlier.controls : [])
    .filter((control) => control.failedStep)
    .map((control) => ({ id: control.id, step: control.failedStep }))
    .filter((control) => run.plan.controls.some((c) => c.id === control.id));
  return (async () => {
    const linked: string[] = [];
    for (const control of ids) {
      const reply = await invoke(
        [
          "--json",
          "result",
          "set",
          "--control",
          control.id,
          "--failed-run",
          old.id,
          "--failed-step",
          control.step,
          "--run",
          run.id,
        ],
        cwd,
      );
      if (reply.status === 0) linked.push(control.id);
    }
    return linked;
  })();
}

export async function replay(
  run: Run,
  options: ReplayOptions,
  track: (ctx: Context) => void,
  unlock: () => void,
): Promise<{ data: Record<string, unknown>; fault?: Fault }> {
  if (options.from === run.id)
    throw new Fault(
      "INVALID_USAGE",
      "replay needs an earlier run, not the run it writes to.",
      `Use spyglass replay --from OLD_RUN --run ${run.id}.`,
    );
  const old = loadRun(run.repo, options.from);
  const planned = plan(old, options.failedOnly);
  const outcomes: Outcome[] = planned.map((item) => ({
    from: item.from,
    command: item.command,
    status: item.skipped ? "skipped" : options.execute ? "not run" : "planned",
    claims: item.claims,
    ...(item.skipped ? { reason: item.skipped } : {}),
  }));
  const ctx = new Context(run, "replay", [
    "--from",
    old.id,
    ...(options.failedOnly ? ["--failed-only"] : []),
    ...(options.execute ? ["--execute"] : []),
  ]);
  track(ctx);
  const head = {
    from: old.id,
    execute: options.execute,
    failedOnly: options.failedOnly,
    steps: outcomes,
  };
  ctx.finish(0, head, 0);
  if (!options.execute) {
    unlock();
    return {
      data: {
        ...head,
        next: `Run spyglass replay --from ${old.id} --run ${run.id} --execute to run these steps.`,
      },
    };
  }
  // Each replayed step is a command of its own, so it takes the run lock again.
  unlock();
  let failure: Fault | undefined;
  for (const [index, item] of planned.entries()) {
    if (item.skipped) continue;
    const reply = await invoke(argv(item, run.id), run.repo);
    outcomes[index] = {
      ...outcomes[index]!,
      step: reply.step,
      status: reply.status === 0 ? "passed" : "failed",
      ...(reply.status === 0
        ? {}
        : { reason: `${reply.code ?? "FAILED"}: ${reply.message ?? ""}` }),
    };
    if (reply.status !== 0) {
      failure = new Fault(
        reply.code ?? "REPLAY_STEP_FAILED",
        `Replayed step ${item.from} (${item.command}) failed: ${reply.message ?? "no message"}`,
        `Fix the cause, then run spyglass replay --from ${old.id} --run ${run.id} --execute again, or run the step by hand.`,
        1,
      );
      break;
    }
  }
  const controls = failure ? [] : await linkControls(run, old, run.repo);
  return {
    data: { ...head, steps: outcomes, linkedControls: controls },
    ...(failure ? { fault: failure } : {}),
  };
}
