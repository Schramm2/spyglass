import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const CLI = join(REPO_ROOT, "dist/cli.js");
export const FIXTURE_ROOT = join(REPO_ROOT, "fixtures/demo-app");

export async function makeRepo({ profile, plan, files = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "spyglass-e2e-"));
  await mkdir(join(dir, "fixtures/demo-app"), { recursive: true });
  await cp(FIXTURE_ROOT, join(dir, "fixtures/demo-app"), { recursive: true });
  await writeFile(
    join(dir, ".gitignore"),
    ".spyglass/\ncheck-output.json\nresult.json\n",
  );
  await writeFile(join(dir, "README.md"), "# Isolated Spyglass fixture\n");
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "spyglass-demo-app",
        private: true,
        scripts: { verify: "node fixtures/demo-app/check.mjs pass" },
      },
      null,
      2,
    ) + "\n",
  );
  if (profile) await writeJson(join(dir, "spyglass.json"), profile);
  if (plan) await writeJson(join(dir, "plan.json"), plan);
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  await git(dir, ["init", "-q"]);
  await git(dir, ["config", "user.name", "Spyglass Test"]);
  await git(dir, ["config", "user.email", "spyglass-test@example.invalid"]);
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-q", "-m", "demo baseline"]);
  return dir;
}

export async function removeRepo(dir) {
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    await rm(stateHome(dir), { recursive: true, force: true });
  }
}

function stateHome(dir) {
  return join(tmpdir(), `${basename(dir)}-state`);
}

/** The stored record of one run of a test repository. */
export async function runRecord(dir, id) {
  const entries = await readdir(stateHome(dir), {
    recursive: true,
    withFileTypes: true,
  });
  const found = entries.find(
    (entry) => entry.name === "run.json" && basename(entry.parentPath) === id,
  );
  assert.ok(found, `run ${id} has no stored record`);
  return join(found.parentPath, found.name);
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

export function baseProfile(overrides = {}) {
  return {
    version: 1,
    app: "spyglass-demo-app",
    evidence: ".spyglass/runs/${run}",
    launch: {
      mode: "owned",
      command: ["node", "fixtures/demo-app/server.mjs"],
      env: { PORT: "${port}" },
      ready: {
        url: "http://127.0.0.1:${port}/health",
        status: 200,
        timeoutMs: 5000,
      },
    },
    web: "http://127.0.0.1:${port}",
    api: "http://127.0.0.1:${port}/api",
    source: { include: ["README.md", "fixtures/demo-app/**"] },
    browser: { allowedOrigins: ["http://127.0.0.1:${port}"] },
    ...overrides,
  };
}

export async function runCli(
  cwd,
  args,
  { env = {}, timeoutMs = 15000, input } = {},
) {
  const execution = startCli(cwd, args, { env, timeoutMs, input });
  const { exit, stdout, stderr } = await execution.done;
  let json;
  try {
    json = JSON.parse(stdout);
  } catch {}
  return { ...exit, stdout, stderr, json };
}

export function startCli(
  cwd,
  args,
  { env = {}, timeoutMs = 15000, input } = {},
) {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, XDG_STATE_HOME: stateHome(cwd), ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  if (input !== undefined) child.stdin.end(input);
  else child.stdin.end();
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const done = new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolveExit({ code, signal }));
  })
    .finally(() => clearTimeout(timer))
    .then((exit) => ({ exit, stdout, stderr }));
  return { child, done };
}

export function assertEnvelope(result, { ok, code } = {}) {
  assert.equal(result.signal, null, `CLI was killed: ${result.stderr}`);
  if (code !== undefined)
    assert.equal(
      result.code,
      code,
      `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  assert.ok(
    result.json,
    `expected one JSON envelope on stdout; got: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.equal(
    result.json.schemaVersion,
    1,
    "result must declare schemaVersion 1",
  );
  assert.equal(result.json.ok, ok, `unexpected result: ${result.stdout}`);
  assert.equal(typeof result.json.status, "string");
  assert.ok(Array.isArray(result.json.artifacts));
  if (!ok) {
    assert.ok(result.json.error && typeof result.json.error.code === "string");
    assert.ok(result.json.error.next, "errors must include a next action");
  }
  return result.json;
}

export async function git(cwd, args) {
  const result = await spawnCapture("git", args, { cwd });
  assert.equal(
    result.code,
    0,
    `git ${args.join(" ")} failed: ${result.stderr}`,
  );
  return result.stdout.trim();
}

export async function spawnCapture(
  command,
  args,
  { cwd, env = {}, timeoutMs = 10000 } = {},
) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const exit = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolveExit({ code, signal }));
  }).finally(() => clearTimeout(timer));
  return { ...exit, stdout, stderr };
}

export async function readRunFile(dir, run, relative) {
  return readFile(join(dir, ".spyglass/runs", run, relative), "utf8");
}

export async function waitFor(
  predicate,
  {
    timeoutMs = 5000,
    intervalMs = 50,
    message = "condition did not become true",
  } = {},
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  assert.fail(message);
}
