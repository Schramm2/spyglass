import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  CLI,
  REPO_ROOT,
  baseProfile,
  makeRepo,
  removeRepo,
  runRecord,
} from "../tests/e2e/helper.mjs";

export { CLI, REPO_ROOT, baseProfile, makeRepo, removeRepo, runRecord };

export const today = () => new Date().toISOString().slice(0, 10);

/** The p-th percentile (0 to 100) by the nearest-rank method. */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export const round = (value, digits = 1) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

/** Run a process to its end. `ms` covers the process start and its exit. */
export async function timed(command, args, { cwd, env = {}, input } = {}) {
  const start = performance.now();
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  child.stdin.end(input ?? "");
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { code, stdout, stderr, ms: performance.now() - start };
}

/** The state home that `tests/e2e/helper.mjs` gives a repository's runs. */
export function stateHome(dir) {
  return join(tmpdir(), `${basename(dir)}-state`);
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Parse the JSON envelope on stdout, or fail with the process output. */
export function envelope(result, label) {
  let json;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `${label}: no JSON envelope. exit ${result.code}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return json;
}

export function requireBuild() {
  return readFile(CLI).catch(() => {
    console.error("dist/cli.js is missing. Run npm run build first.");
    process.exit(2);
  });
}

export function table(rows, columns) {
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column]).length)),
  );
  const line = (cells) =>
    "| " +
    cells.map((cell, i) => String(cell).padEnd(widths[i])).join(" | ") +
    " |";
  return [
    line(columns),
    "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |",
    ...rows.map((row) => line(columns.map((column) => row[column]))),
  ].join("\n");
}
