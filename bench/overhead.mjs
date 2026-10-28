#!/usr/bin/env node
// Tier 2 of docs/verification-speed.md: the overhead gate.
//
// Measures the time that Spyglass adds to a browser command and the cold start
// of the CLI. Each pair runs the direct `agent-browser batch --bail --json`
// command, then the Spyglass command, in the same run, session, proxy and
// browser. Exits 1 when the p50 added time is over 120 ms or the p95 is over
// 150 ms. With --gate-cold, also exits 1 when the cold start is over 100 ms.
//
//   node bench/overhead.mjs [--pairs N] [--gate-cold] [--label NAME] [--no-write]
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLI,
  REPO_ROOT,
  baseProfile,
  envelope,
  makeRepo,
  percentile,
  readJson,
  removeRepo,
  requireBuild,
  round,
  runRecord,
  sha256,
  stateHome,
  table,
  timed,
  today,
} from "./common.mjs";

const P50_BUDGET_MS = 120;
const P95_BUDGET_MS = 150;
const COLD_BUDGET_MS = 100;

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at < 0 ? fallback : argv[at + 1];
};
const pairs = Number(option("--pairs", 20));
const gateCold = argv.includes("--gate-cold");
const write = !argv.includes("--no-write");
const label = option("--label", "");

await requireBuild();
const repo = await makeRepo({ profile: baseProfile() });
const env = { XDG_STATE_HOME: stateHome(repo) };
const shotDir = await mkdtemp(join(tmpdir(), "spyglass-bench-"));
const spyglass = (args) =>
  timed(process.execPath, [CLI, ...args, "--json"], { cwd: repo, env });

let failure;
try {
  const up = await spyglass(["up", "--run", "bench"]);
  const started = envelope(up, "up");
  if (!started.ok) throw new Error(`up failed: ${up.stdout}`);

  // Cold start: a new Node process that only prints the version.
  const cold = [];
  await timed(process.execPath, [CLI, "--version"], { cwd: repo, env });
  for (let i = 0; i < pairs; i++)
    cold.push(
      (await timed(process.execPath, [CLI, "--version"], { cwd: repo, env }))
        .ms,
    );

  // Open the page once, so the browser, the daemon and the proxy are warm.
  const opened = await spyglass(["ui", "open", "/", "--run", "bench"]);
  if (!envelope(opened, "ui open").ok)
    throw new Error(`ui open failed: ${opened.stdout}`);

  const record = await readJson(await runRecord(repo, "bench"));
  const key = sha256(record.repo + "\0" + record.id);
  const identity = {
    namespace: "sg-" + key.slice(0, 12),
    session: "s-" + sha256("default").slice(0, 12),
  };
  const home = join(await runRecord(repo, "bench"), "..");
  const domains = new URL(record.web).hostname;
  const idle = String(record.profile.browser?.idleTimeoutMs ?? 3_600_000);
  const directArgs = [
    "--config",
    join(home, "browser-config.json"),
    "--namespace",
    identity.namespace,
    "--session",
    identity.session,
    "--allowed-domains",
    domains,
    "--proxy",
    `http://127.0.0.1:${record.browserProxy.port}`,
    "--proxy-bypass",
    "<-loopback>",
    "--content-boundaries",
    "--pin-tab",
    "--idle-timeout",
    idle,
    "--json",
  ];
  const directEnv = {
    ...env,
    AGENT_BROWSER_CONFIG: join(home, "browser-config.json"),
    AGENT_BROWSER_NAMESPACE: identity.namespace,
    AGENT_BROWSER_SESSION: identity.session,
    AGENT_BROWSER_ALLOWED_DOMAINS: domains,
    AGENT_BROWSER_CONTENT_BOUNDARIES: "1",
    AGENT_BROWSER_PIN_TAB: "1",
    AGENT_BROWSER_IDLE_TIMEOUT_MS: idle,
  };
  const direct = (commands) =>
    timed("agent-browser", [...directArgs, "batch", "--bail", "--json"], {
      cwd: repo,
      env: directEnv,
      input: JSON.stringify(commands),
    });

  // Each scenario names the Spyglass command and the direct batch that does
  // the same browser work. A command that this build lacks is skipped.
  const scenarios = [
    {
      name: "ui get title",
      spyglass: ["ui", "get", "title", "--run", "bench"],
      direct: [["get", "title"]],
    },
    {
      name: "ui expect --title",
      spyglass: ["ui", "expect", "--title", "Spyglass demo", "--run", "bench"],
      direct: [["get", "title"]],
    },
    {
      name: "ui verify (5 actions + proof)",
      spyglass: [
        "ui",
        "verify",
        "--do",
        "get title",
        "--do",
        "get url",
        "--do",
        "is visible input[name=email]",
        "--do",
        "get count input",
        "--do",
        "get text h1",
        "--proof",
        "bench",
        "--run",
        "bench",
      ],
      // The same browser work in one direct batch: the five actions, then the
      // commands of a proof.
      direct: () => [
        ["get", "title"],
        ["get", "url"],
        ["is", "visible", "input[name=email]"],
        ["get", "count", "input"],
        ["get", "text", "h1"],
        ["snapshot", "-i", "-c", "--delta"],
        ["get", "url"],
        ["get", "title"],
        ["console", "--clear"],
        ["errors", "--clear"],
        ["network", "requests", "--clear"],
        [
          "eval",
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        ],
        ["screenshot", join(shotDir, "direct.png")],
      ],
    },
  ];

  const measured = [];
  for (const scenario of scenarios) {
    const probe = await spyglass(scenario.spyglass);
    if (!envelope(probe, scenario.name).ok) {
      measured.push({
        name: scenario.name,
        skipped: envelope(probe, scenario.name).error?.code ?? "failed",
      });
      continue;
    }
    const commands = () =>
      typeof scenario.direct === "function"
        ? scenario.direct()
        : scenario.direct;
    await direct(commands());
    const rows = [];
    for (let i = 0; i < pairs; i++) {
      const base = await direct(commands());
      if (base.code !== 0)
        throw new Error(`direct ${scenario.name} failed: ${base.stdout}`);
      const through = await spyglass(scenario.spyglass);
      if (through.code !== 0)
        throw new Error(`${scenario.name} failed: ${through.stdout}`);
      rows.push({
        pair: i + 1,
        direct: round(base.ms),
        spyglass: round(through.ms),
        added: round(through.ms - base.ms),
      });
    }
    const added = rows.map((row) => row.added);
    measured.push({
      name: scenario.name,
      pairs: rows,
      directP50: round(
        percentile(
          rows.map((row) => row.direct),
          50,
        ),
      ),
      spyglassP50: round(
        percentile(
          rows.map((row) => row.spyglass),
          50,
        ),
      ),
      addedP50: round(percentile(added, 50)),
      addedP95: round(percentile(added, 95)),
      addedMax: round(Math.max(...added)),
    });
  }

  const result = {
    date: today(),
    node: process.version,
    agentBrowser: (await timed("agent-browser", ["--version"])).stdout.trim(),
    pairs,
    budgetsMs: { p50: P50_BUDGET_MS, p95: P95_BUDGET_MS, cold: COLD_BUDGET_MS },
    coldStart: {
      p50: round(percentile(cold, 50)),
      p95: round(percentile(cold, 95)),
    },
    scenarios: measured,
  };

  console.log(
    `Cold start (spyglass --version): p50 ${result.coldStart.p50} ms, p95 ${result.coldStart.p95} ms (goal ${COLD_BUDGET_MS} ms)\n`,
  );
  console.log(
    table(
      measured.map((row) =>
        row.skipped
          ? {
              Scenario: row.name,
              "Direct p50": "-",
              "Spyglass p50": "-",
              "Added p50": "-",
              "Added p95": "-",
              Result: `skipped (${row.skipped})`,
            }
          : {
              Scenario: row.name,
              "Direct p50": row.directP50,
              "Spyglass p50": row.spyglassP50,
              "Added p50": row.addedP50,
              "Added p95": row.addedP95,
              Result:
                row.addedP50 <= P50_BUDGET_MS && row.addedP95 <= P95_BUDGET_MS
                  ? "pass"
                  : "FAIL",
            },
      ),
      [
        "Scenario",
        "Direct p50",
        "Spyglass p50",
        "Added p50",
        "Added p95",
        "Result",
      ],
    ),
  );

  const failures = measured.filter(
    (row) =>
      !row.skipped &&
      (row.addedP50 > P50_BUDGET_MS || row.addedP95 > P95_BUDGET_MS),
  );
  if (!measured.some((row) => !row.skipped)) throw new Error("no scenario ran");
  if (gateCold && result.coldStart.p50 > COLD_BUDGET_MS)
    failures.push({ name: "cold start" });
  result.passed = failures.length === 0;

  if (write) {
    const dir = join(REPO_ROOT, "bench/results");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `overhead-${result.date}${label ? "-" + label : ""}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
  }
  console.log(
    result.passed
      ? "\nOverhead gate: pass"
      : `\nOverhead gate: FAIL (${failures.map((f) => f.name).join(", ")})`,
  );
  process.exitCode = result.passed ? 0 : 1;
} catch (error) {
  failure = error;
} finally {
  await spyglass(["down", "--run", "bench"]).catch(() => undefined);
  await removeRepo(repo);
  await rm(shotDir, { recursive: true, force: true });
}
if (failure) {
  console.error(failure.message);
  process.exitCode = 2;
}
