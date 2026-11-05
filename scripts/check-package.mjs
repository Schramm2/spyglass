// Check an exact archive (or an exact public registry version) outside the checkout.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [spec, destination] = process.argv.slice(2);
assert.ok(
  spec && destination,
  "Usage: node scripts/check-package.mjs ARCHIVE_OR_EXACT_SPEC OUTPUT",
);
assert.ok(
  spec.endsWith(".tgz") ||
    /^@mattschramm\/spyglass@\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(spec),
  "Use an archive or an exact Spyglass version",
);
const output = resolve(destination);
mkdirSync(output, { recursive: true });
const root = mkdtempSync(join(tmpdir(), "spyglass-package-"));
const repo = join(root, "target");
const prefix = join(root, "tool");
mkdirSync(repo);
const env = {
  ...process.env,
  XDG_STATE_HOME: join(root, "state"),
  NODE_PATH: "",
  NODE_OPTIONS: "",
};
const calls = [];
function command(executable, args, cwd = repo) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 120000,
  });
  calls.push({
    command: executable === cli ? "spyglass" : executable,
    args,
    code: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  writeFileSync(
    join(output, "commands.json"),
    JSON.stringify(calls, null, 2) + "\n",
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}
function pass(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
const cli = join(prefix, "bin/spyglass");
function call(args, code = 0) {
  const result = command(cli, ["--json", "--run", "package-check", ...args]);
  assert.equal(result.status, code, result.stdout + result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, code === 0, result.stdout);
  return envelope;
}
let allocated = false;
let complete = false;
let cleaned = false;
let metadata;
try {
  pass(
    command("npm", [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      spec.endsWith(".tgz") ? resolve(spec) : spec,
    ]),
  );
  metadata = JSON.parse(
    readFileSync(
      join(prefix, "lib/node_modules/@mattschramm/spyglass/package.json"),
      "utf8",
    ),
  );
  assert.equal(metadata.name, "@mattschramm/spyglass");
  const installed = join(prefix, "lib/node_modules/@mattschramm/spyglass");
  for (const path of [
    "dist/cli.js",
    "dist/supervisor.js",
    "dist/browser.js",
    "dist/browser-proxy.js",
    "schemas/profile.schema.json",
    "schemas/plan.schema.json",
    "schemas/result.schema.json",
    "skills/spyglass/SKILL.md",
    "skills/create-verification-skill/SKILL.md",
    "skills/maintain-verification-skill/SKILL.md",
  ]) {
    assert.ok(
      existsSync(join(installed, path)),
      `Installed package needs ${path}`,
    );
  }
  const require = createRequire(join(installed, "package.json"));
  for (const dependency of ["pg", "zod"])
    assert.ok(
      require(dependency),
      `Installed dependency ${dependency} must load`,
    );
  assert.equal(pass(command(cli, ["--version"])).trim(), metadata.version);
  assert.match(pass(command(cli, ["--help"])), /Spyglass/i);
  for (const kind of ["profile", "plan", "result"]) {
    const schema = call(["schema", kind]);
    assert.equal(schema.data.schema.type, "object");
  }
  const json = (name, value) =>
    writeFileSync(join(repo, name), JSON.stringify(value, null, 2) + "\n");
  writeFileSync(join(repo, ".gitignore"), ".spyglass/\n");
  json("spyglass.json", {
    version: 1,
    app: "package-check",
    launch: { mode: "none" },
    checks: {
      verify: {
        command: [
          "node",
          "-e",
          "const ok=!require('node:fs').existsSync('.spyglass/fault');console.log(JSON.stringify({ok,claims:[{id:'installed-check',ok}]}))",
        ],
        result: "json",
      },
    },
  });
  json("plan.json", {
    claims: [
      {
        id: "installed-check",
        behavior:
          "The installed command records a check and retains its report.",
        entryPoint: "spyglass check verify",
        precondition: "Archive installed without scripts.",
        expected: "The unchanged check passes after fault removal.",
        case: "Fault and restored target.",
        checks: ["verify"],
        evidence: ["check output and report"],
        kind: "behavior",
      },
    ],
    controls: [
      {
        id: "detect-fault",
        claim: "installed-check",
        expectation: "The same assertion detects the fault marker.",
        assertion: "installed-check",
      },
    ],
    gates: [],
    limits: [
      "Command-only installation check; no browser, database or cross-platform proof.",
    ],
  });
  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "Spyglass Package Check"],
    ["config", "user.email", "package-check@example.invalid"],
    ["add", "."],
    ["commit", "-qm", "package fixture"],
  ])
    pass(command("git", args));
  // Mark allocation uncertain before up so a failed launch still gets cleanup.
  allocated = true;
  call(["up", "--plan", "plan.json"]);
  mkdirSync(join(repo, ".spyglass"), { recursive: true });
  writeFileSync(join(repo, ".spyglass/fault"), "fault\n");
  const failed = call(
    ["check", "verify", "--control", "detect-fault:failed"],
    1,
  );
  assert.equal(failed.error.code, "CHECK_FAILED");
  assert.ok(
    failed.data.claims.some(
      (row) => row.id === "installed-check" && row.ok === false,
    ),
  );
  rmSync(join(repo, ".spyglass/fault"));
  call([
    "check",
    "verify",
    "--claim",
    "installed-check",
    "--control",
    "detect-fault:restored",
  ]);
  call([
    "result",
    "set",
    "--claim",
    "installed-check",
    "--outcome",
    "passed",
    "--observed",
    "The installed executable ran the unchanged check successfully after fault removal.",
  ]);
  call([
    "result",
    "set",
    "--control",
    "detect-fault",
    "--observed-failure",
    "The installed-check assertion failed with the fault marker.",
    "--observed-pass",
    "The same assertion passed without the marker.",
  ]);
  call(["result"]);
  call(["doctor"]);
  call(["down"]);
  cleaned = true;
  const report = call(["report"]);
  assert.equal(report.data.complete, true);
  assert.equal(report.data.cleanup.spyglassResourcesCleaned, true);
  for (const [source, target] of [
    [report.data.reportPath, "report.html"],
    [report.data.reviewPath, "review.md"],
  ])
    cpSync(source, join(output, target));
  // Reopen after cleanup through a new CLI process.
  assert.equal(call(["report"]).data.complete, true);
  complete = true;
} finally {
  if (allocated && !cleaned) {
    command(cli, ["down", "--run", "package-check", "--json"]);
    command(cli, ["report", "--run", "package-check", "--json"]);
  }
  const evidence = join(repo, ".spyglass/runs/package-check");
  try {
    cpSync(evidence, join(output, "evidence"), { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const integrity = spec.endsWith(".tgz")
    ? "sha512-" +
      createHash("sha512")
        .update(readFileSync(resolve(spec)))
        .digest("base64")
    : null;
  writeFileSync(
    join(output, "package-check.json"),
    JSON.stringify(
      {
        version: metadata?.version,
        integrity,
        complete,
        cleaned,
        node: process.version,
      },
      null,
      2,
    ) + "\n",
  );
  const checksums = readdirSync(output, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS")
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      const relative = path.slice(output.length + 1);
      return `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${relative}`;
    })
    .sort();
  writeFileSync(join(output, "SHA256SUMS"), checksums.join("\n") + "\n");
  rmSync(root, { recursive: true, force: true });
}
console.log(`Package check passed: ${metadata.version}`);
