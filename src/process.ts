import { spawn, spawnSync } from "node:child_process";
import { Fault } from "./errors.js";
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  maxBytes?: number;
}
export async function runCommand(
  command: string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  if (!command[0])
    throw new Fault(
      "MISSING_COMMAND",
      "A command is required.",
      "Use spyglass exec -- <command> [args].",
    );
  return await new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "",
      stderr = "",
      timedOut = false,
      overflow = false;
    const kill = () => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs ?? 30000);
    const add = (kind: "stdout" | "stderr", data: string) => {
      if (kind === "stdout") stdout += data;
      else stderr += data;
      if (
        Buffer.byteLength(stdout) + Buffer.byteLength(stderr) >
        (options.maxBytes ?? 8 * 1024 * 1024)
      ) {
        overflow = true;
        kill();
      }
    };
    child.stdout.setEncoding("utf8").on("data", (d) => add("stdout", d));
    child.stderr.setEncoding("utf8").on("data", (d) => add("stderr", d));
    child.stdin.on("error", () => {});
    child.stdin.end(options.input);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(
        new Fault(
          "TOOL_UNAVAILABLE",
          `${command[0]}: ${e.message}`,
          `Install or repair ${command[0]} and run spyglass doctor.`,
          3,
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: timedOut ? 124 : overflow ? 125 : (code ?? 1),
        stdout,
        stderr:
          stderr + (overflow ? "\nOutput exceeded the capture limit." : ""),
        timedOut,
      });
    });
  });
}
// A process identity is the `ps lstart` text, which follows the caller's
// locale and time zone. Fix both so a run started from one shell can be
// stopped from another; a mismatch would leave the owned process running.
const PS_ENV = { ...process.env, LC_ALL: "C", TZ: "UTC" };

export function processIdentity(pid: number): string | null {
  const r = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
    env: PS_ENV,
  });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

/** True while `pid` still runs the process whose start identity was saved.
 * A run recorded before ps was pinned to C/UTC kept the caller's format, so
 * that reading also counts; either one still refuses a reused PID. */
export function isSameProcess(pid: number, identity: string): boolean {
  if (processIdentity(pid) === identity) return true;
  const r = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
  });
  return r.status === 0 && r.stdout.trim() === identity;
}

export function processGroupMembers(
  group: number,
): Array<{ pid: number; identity: string }> {
  const r = spawnSync("ps", ["-axo", "pid=,pgid=,stat=,lstart="], {
    encoding: "utf8",
    env: PS_ENV,
  });
  if (r.status !== 0)
    throw new Fault(
      "PROCESS_INSPECTION_FAILED",
      "Cannot inspect owned process-group members.",
      "Check process inspection permissions before retrying down.",
      3,
    );
  return r.stdout.split("\n").flatMap((line) => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return m && Number(m[2]) === group && !m[3]!.startsWith("Z")
      ? [{ pid: Number(m[1]), identity: m[4]!.trim() }]
      : [];
  });
}
