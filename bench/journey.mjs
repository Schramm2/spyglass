#!/usr/bin/env node
// Tier 1 of docs/verification-speed.md: a scripted 12-claim journey, no model.
//
// Drives one fixed journey on fixtures/demo-app through four paths and records
// wall time (median and p95), processes started, operator steps (shell
// invocations), stdout bytes that the driver reads, recorded steps, retained
// artifacts and failed attempts. Any difference comes from the CLI design and
// the command granularity, not from a model.
//
//   node bench/journey.mjs [--runs N] [--paths direct,playwright,baseline,composite] [--label NAME] [--no-write]
//
// Paths:
//   direct      agent-browser batches and fetch, in one script: the tool floor.
//   playwright  one Playwright script: the inline-script baseline.
//   baseline    Spyglass 1.2.0 workflow: one operation per call.
//   composite   ui verify, api --wait-until, --claim and finish.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  CLI,
  REPO_ROOT,
  baseProfile,
  envelope,
  makeRepo,
  percentile,
  removeRepo,
  requireBuild,
  round,
  stateHome,
  table,
  timed,
  today,
} from "./common.mjs";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at < 0 ? fallback : argv[at + 1];
};
const runs = Number(option("--runs", 20));
const selected = option(
  "--paths",
  "direct,playwright,baseline,composite",
).split(",");
const write = !argv.includes("--no-write");
const label = option("--label", "");

const PASSWORD = "bench-demo-password";
const TOKEN = "bench-demo-token";
const SECRETS = {
  DEMO_PASSWORD: PASSWORD,
  DEMO_TOKEN: TOKEN,
  BENCH_TOKEN: TOKEN,
};
const QUESTION = "How long does a completed check take?";

const claim = (id, kind, behavior, expected, checks = ["browser"]) => ({
  id,
  behavior,
  entryPoint: "The demo app.",
  precondition: "The owned demo app is ready.",
  expected,
  case: "Valid demo input.",
  checks,
  evidence: ["Retained step evidence"],
  kind,
  required: true,
});

export const CLAIMS = [
  claim(
    "signin-refused",
    "behavior",
    "A wrong password is refused.",
    "The page shows Sign in failed.",
  ),
  claim(
    "focus-email",
    "behavior",
    "Selecting the Email label focuses the Email field.",
    "Focus is on Email.",
  ),
  claim(
    "login-success",
    "behavior",
    "The demo user signs in.",
    "The browser reaches the dashboard.",
  ),
  claim(
    "dashboard-heading",
    "behavior",
    "The dashboard names its purpose.",
    "The heading reads Ask a question.",
  ),
  claim(
    "dashboard-form",
    "behavior",
    "The question form accepts input.",
    "The field is visible and the button is enabled.",
  ),
  claim(
    "visual-desktop",
    "visual",
    "The dashboard fits a desktop viewport.",
    "The form is readable at 1280x800.",
  ),
  claim(
    "visual-mobile",
    "visual",
    "The dashboard fits a phone viewport.",
    "The form is readable at 390x844.",
  ),
  claim(
    "question-accepted",
    "behavior",
    "A question is accepted for processing.",
    "HTTP 202 with status pending.",
    ["api"],
  ),
  claim(
    "question-completed",
    "side-effect",
    "An accepted question completes.",
    "A later read shows status complete.",
    ["api"],
  ),
  claim(
    "question-listed",
    "side-effect",
    "A completed question is listed.",
    "The list read contains the question.",
    ["api"],
  ),
  claim(
    "error-page-reported",
    "behavior",
    "The error page reports its console and page errors.",
    "The page shows at least one error.",
  ),
  claim(
    "control-detects-failure",
    "behavior",
    "The demo check detects its deliberate failure.",
    "The assertion fails, then passes.",
    ["pass"],
  ),
];
const PLAN = {
  claims: CLAIMS,
  controls: [
    {
      id: "demo-failure-control",
      claim: "control-detects-failure",
      expectation: "The same assertion detects the deliberate failure.",
      assertion: "demo-check",
    },
  ],
  gates: [],
  limits: ["The journey proves the command workflow on the demo app only."],
};

function journeyProfile() {
  return baseProfile({
    api: "http://127.0.0.1:${port}/api",
    seats: {
      agent: {
        token: "env:BENCH_TOKEN",
        login: {
          path: "/login",
          steps: [
            { fill: { label: "Email" }, value: "agent@example.test" },
            { fill: { label: "Password" }, secret: "env:DEMO_PASSWORD" },
            { click: { role: "button", name: "Sign in" } },
          ],
          done: { urlContains: "/dashboard" },
        },
      },
    },
    checks: {
      fail: {
        command: ["node", "fixtures/demo-app/check.mjs", "fail"],
        result: "json",
      },
      pass: {
        command: ["node", "fixtures/demo-app/check.mjs", "pass"],
        result: "json",
      },
    },
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function emptyMetrics() {
  return { processes: 0, operatorSteps: 0, stdoutBytes: 0, retries: 0 };
}

// ---------------------------------------------------------------------------
// Spyglass paths

/** One Spyglass CLI call. Each call is one operator step and one process. */
function spyglassDriver(repo, metrics) {
  const env = { XDG_STATE_HOME: stateHome(repo), ...SECRETS };
  return async (args, { allowFail = false } = {}) => {
    const result = await timed(process.execPath, [CLI, "--json", ...args], {
      cwd: repo,
      env,
    });
    metrics.processes += 1;
    metrics.operatorSteps += 1;
    metrics.stdoutBytes += Buffer.byteLength(result.stdout);
    const json = envelope(result, args.join(" "));
    if (!json.ok && !allowFail)
      throw new Error(`spyglass ${args.join(" ")} failed: ${result.stdout}`);
    return json;
  };
}

const imagePaths = (json) =>
  json.artifacts.filter((a) => /\.png$/.test(a.path)).map((a) => a.path);
const evidencePaths = (json) => json.artifacts.map((a) => a.path);

async function collect(repo, run) {
  const log = await readFile(
    join(repo, ".spyglass/runs", run, "spyglass/log.jsonl"),
    "utf8",
  );
  const entries = log
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return {
    recordedSteps: entries.length,
    retainedArtifacts: entries.reduce(
      (sum, entry) => sum + entry.artifacts.length,
      0,
    ),
    failedAttempts: entries.filter((entry) => entry.status === "failed").length,
  };
}

function buildResult(parts) {
  const { proofs, steps, posts, polls, list, control } = parts;
  const behavior = (id, step, observed) => ({
    id,
    outcome: "passed",
    steps: [step.step],
    observed,
    artifacts: evidencePaths(step).filter((p) => !/\.png$/.test(p)),
  });
  const visual = (id, step, viewport, observed) => ({
    id,
    outcome: "passed",
    steps: [step.step],
    observed,
    artifacts: imagePaths(step),
    inspections: [
      {
        viewport,
        expected: "The form is readable.",
        observed,
        artifact: imagePaths(step)[0],
      },
    ],
  });
  return {
    operator: "agent",
    controls: [
      {
        id: "demo-failure-control",
        failedRun: parts.run,
        failedStep: control.fail.step,
        restoredStep: control.pass.step,
        observedFailure: "The demo assertion failed.",
        observedPass: "The same assertion passed.",
      },
    ],
    claims: [
      behavior(
        "signin-refused",
        proofs.refused,
        "The page showed Sign in failed.",
      ),
      behavior("focus-email", steps.focus, "Focus was on Email."),
      behavior("login-success", proofs.signedIn, "The dashboard opened."),
      behavior(
        "dashboard-heading",
        proofs.heading,
        "The heading read Ask a question.",
      ),
      behavior(
        "dashboard-form",
        proofs.form,
        "The field was visible and the button enabled.",
      ),
      visual(
        "visual-desktop",
        proofs.desktop,
        "1280x800",
        "The form was readable on desktop.",
      ),
      visual(
        "visual-mobile",
        proofs.mobile,
        "390x844",
        "The form was readable on a phone.",
      ),
      behavior("question-accepted", posts, "HTTP 202 with status pending."),
      {
        id: "question-completed",
        outcome: "passed",
        steps: [posts.step, polls.step],
        observed: "A later read showed status complete.",
        artifacts: evidencePaths(polls),
        independentRead: polls.step,
      },
      {
        id: "question-listed",
        outcome: "passed",
        steps: [posts.step, list.step],
        observed: "The list contained the question.",
        artifacts: evidencePaths(list),
        independentRead: list.step,
      },
      behavior(
        "error-page-reported",
        proofs.errorPage,
        "The page reported errors.",
      ),
      {
        id: "control-detects-failure",
        outcome: "passed",
        steps: [control.pass.step],
        observed: "The assertion passed after it failed.",
        artifacts: evidencePaths(control.pass),
      },
    ],
    gates: [],
    limits: PLAN.limits,
  };
}

/** Spyglass 1.2.0: one operation per call, the result written at the end. */
async function runBaseline(repo, metrics) {
  const spy = spyglassDriver(repo, metrics);
  const run = "journey";
  await spy(["up", "--run", run, "--plan", "plan.json"]);
  const r = ["--run", run];
  const ui = (...args) => spy(["ui", ...args, ...r]);
  const api = (...args) => spy(["api", ...args, ...r]);

  await ui("open", "/login");
  await ui("find", "label", "Email", "fill", "agent@example.test");
  await ui("find", "label", "Password", "fill", "wrong-password-value");
  await ui("find", "role", "button", "click", "--name", "Sign in");
  await ui("wait", "--text", "Sign in failed");
  const refused = await ui("proof", "signin-refused");

  await ui("open", "/login");
  await ui("find", "label", "Email", "click");
  const focus = await ui("focused", "--expect", "Email");

  await spy(["ui", "login", "agent", ...r]);
  const signedIn = await ui("proof", "signed-in");
  await ui("wait", "--text", "Ask a question");
  await ui("get", "text", "h1");
  const heading = await ui("proof", "dashboard-heading");
  await ui("is", "visible", "#question");
  await ui("is", "enabled", "button");
  const form = await ui("proof", "dashboard-form");
  await ui("set", "viewport", "1280", "800");
  const desktop = await ui("proof", "visual-desktop");
  await ui("set", "viewport", "390", "844");
  const mobile = await ui("proof", "visual-mobile");

  const post = await api(
    "POST",
    "/questions",
    "--seat",
    "agent",
    "--data",
    JSON.stringify({ question: QUESTION }),
    "--expect",
    "202",
  );
  let polled;
  for (let attempt = 0; attempt < 40; attempt++) {
    polled = await api(
      "GET",
      `/questions/${post.data.body.id}`,
      "--seat",
      "agent",
      "--expect",
      "200",
    );
    if (polled.data.body.status === "complete") break;
    metrics.retries += 1;
  }
  const list = await api(
    "GET",
    "/questions",
    "--seat",
    "agent",
    "--expect",
    "200",
  );

  await ui("open", "/error");
  await ui("errors");
  const errorPage = await ui("proof", "error-page");

  const failed = await spy(["check", "fail", ...r], { allowFail: true });
  const passed = await spy(["check", "pass", ...r]);

  const result = buildResult({
    run,
    proofs: { refused, signedIn, heading, form, desktop, mobile, errorPage },
    steps: { focus },
    posts: post,
    polls: polled,
    list,
    control: { fail: failed, pass: passed },
  });
  await writeFile(join(repo, "result.json"), JSON.stringify(result, null, 2));
  metrics.operatorSteps += 1; // The operator writes result.json.
  await spy(["result", "--file", "result.json", ...r]);
  await spy(["doctor", ...r]);
  await spy(["down", ...r]);
  const report = await spy(["report", ...r]);
  if (report.data.status !== "passed")
    throw new Error(
      `report is ${report.data.status}: ${JSON.stringify(report.data.findings)}`,
    );
  return collect(repo, run);
}

/** The composite workflow: one batch per page, links on every step, one finish. */
async function runComposite(repo, metrics) {
  const probe = await timed(process.execPath, [CLI, "--json", "ui", "--help"], {
    cwd: repo,
  });
  if (!/verify \[--open/.test(probe.stdout))
    return { skipped: "ui verify is not in this build" };
  const spy = spyglassDriver(repo, metrics);
  const run = "journey";
  await spy(["up", "--run", run, "--plan", "plan.json"]);
  const r = ["--run", run];
  const link = (...ids) => ids.flatMap((id) => ["--claim", id]);

  await spy([
    "ui",
    "verify",
    "--open",
    "/login",
    "--do",
    'find label Email fill "agent@example.test"',
    "--do",
    'find label Password fill "wrong-password-value"',
    "--do",
    'find role button click --name "Sign in"',
    "--expect",
    "text=Sign in failed",
    "--proof",
    "signin-refused",
    ...link("signin-refused"),
    ...r,
  ]);
  await spy([
    "ui",
    "verify",
    "--open",
    "/login",
    "--do",
    "find label Email click",
    "--expect-focus-moved",
    "Email",
    ...link("focus-email"),
    ...r,
  ]);
  await spy(["ui", "login", "agent", ...r]);
  await spy([
    "ui",
    "verify",
    "--expect",
    "text=Ask a question",
    "--expect",
    "visible=#question",
    "--expect",
    "enabled=button",
    "--proof",
    "dashboard",
    "--viewport",
    "1280x800",
    "--viewport",
    "390x844",
    ...link(
      "login-success",
      "dashboard-heading",
      "dashboard-form",
      "visual-desktop",
      "visual-mobile",
    ),
    ...r,
  ]);

  const post = await spy([
    "api",
    "POST",
    "/questions",
    "--seat",
    "agent",
    "--data",
    JSON.stringify({ question: QUESTION }),
    "--expect",
    "202",
    "--expect-json",
    "status=pending",
    ...link("question-accepted", "question-completed", "question-listed"),
    ...r,
  ]);
  await spy([
    "api",
    "GET",
    `/questions/${post.data.body.id}`,
    "--seat",
    "agent",
    "--wait-until",
    "status=complete",
    "--independent-read",
    ...link("question-completed"),
    ...r,
  ]);
  await spy([
    "api",
    "GET",
    "/questions",
    "--seat",
    "agent",
    "--expect",
    "200",
    "--expect-body-contains",
    QUESTION,
    "--independent-read",
    ...link("question-listed"),
    ...r,
  ]);
  await spy([
    "ui",
    "verify",
    "--open",
    "/error",
    "--proof",
    "error-page",
    ...link("error-page-reported"),
    ...r,
  ]);
  await spy(
    ["check", "fail", "--control", "demo-failure-control:failed", ...r],
    {
      allowFail: true,
    },
  );
  await spy([
    "check",
    "pass",
    "--control",
    "demo-failure-control:restored",
    ...link("control-detects-failure"),
    ...r,
  ]);

  // The operator writes what was observed into the pending result.
  const file = join(repo, ".spyglass/runs", run, "spyglass/result.json");
  const result = JSON.parse(await readFile(file, "utf8"));
  for (const row of result.claims) {
    row.outcome = "passed";
    row.observed = `The ${row.id} behavior was observed.`;
    for (const inspection of row.inspections ?? []) {
      inspection.expected = "The form is readable.";
      inspection.observed = "The form was readable.";
    }
  }
  for (const control of result.controls) {
    control.observedFailure = "The demo assertion failed.";
    control.observedPass = "The same assertion passed.";
  }
  result.operator = "agent";
  result.limits = PLAN.limits;
  await writeFile(file, JSON.stringify(result, null, 2));
  metrics.operatorSteps += 1;
  const finished = await spy(["finish", ...r]);
  if (finished.data.report?.status !== "passed")
    throw new Error(`finish: ${JSON.stringify(finished.data)}`);
  return collect(repo, run);
}

// ---------------------------------------------------------------------------
// Tool floor and inline script paths

async function startApp() {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [join(REPO_ROOT, "fixtures/demo-app/server.mjs")],
    {
      env: {
        ...process.env,
        PORT: String(port),
        DEMO_PASSWORD: PASSWORD,
        DEMO_TOKEN: TOKEN,
      },
      stdio: "ignore",
    },
  );
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base + "/health");
      if (response.ok) return { child, base };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  child.kill();
  throw new Error("demo app did not start");
}

async function api(base, metrics, method, path, body) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  metrics.stdoutBytes += Buffer.byteLength(text);
  return { status: response.status, body: JSON.parse(text) };
}

async function pollQuestion(base, metrics, id) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const read = await api(base, metrics, "GET", `/questions/${id}`);
    if (read.body.status === "complete") return read;
    metrics.retries += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("question did not complete");
}

function expectOk(value, message) {
  if (!value) throw new Error(message);
}

let directRuns = 0;

/** agent-browser batches and fetch in one script: the tool floor. */
async function runDirect(metrics) {
  const { child, base } = await startApp();
  const dir = await mkdtemp(join(tmpdir(), "spyglass-bench-direct-"));
  const session = `bench-direct-${process.pid}-${directRuns++}`;
  const batch = async (commands) => {
    const result = await timed(
      "agent-browser",
      ["--session", session, "--json", "batch", "--bail", "--json"],
      { input: JSON.stringify(commands) },
    );
    metrics.processes += 1;
    metrics.stdoutBytes += Buffer.byteLength(result.stdout);
    const items = JSON.parse(result.stdout);
    expectOk(
      Array.isArray(items),
      `agent-browser returned ${result.stdout.slice(0, 400)} ${result.stderr.slice(0, 200)}`,
    );
    expectOk(
      items.every((item) => item.success),
      `agent-browser failed: ${result.stdout.slice(0, 400)}`,
    );
    return items;
  };
  metrics.processes += 1; // the app
  metrics.operatorSteps = 1; // one script
  try {
    const login = ["find", "label", "Email", "fill", "agent@example.test"];
    await batch([
      ["open", base + "/login"],
      login,
      ["find", "label", "Password", "fill", "wrong-password-value"],
      ["find", "role", "button", "click", "--name", "Sign in"],
      ["wait", "--text", "Sign in failed"],
      ["screenshot", join(dir, "1.png")],
    ]);
    await batch([
      ["open", base + "/login"],
      ["find", "label", "Email", "click"],
      ["eval", "document.activeElement.labels?.[0]?.textContent?.trim()"],
    ]);
    await batch([
      ["open", base + "/login"],
      login,
      ["find", "label", "Password", "fill", PASSWORD],
      ["find", "role", "button", "click", "--name", "Sign in"],
      ["wait", "--url", "**/dashboard"],
      ["wait", "--text", "Ask a question"],
      ["get", "text", "h1"],
      ["is", "visible", "#question"],
      ["is", "enabled", "button"],
      ["set", "viewport", "1280", "800"],
      ["screenshot", join(dir, "2.png")],
      ["set", "viewport", "390", "844"],
      ["screenshot", join(dir, "3.png")],
    ]);
    const post = await api(base, metrics, "POST", "/questions", {
      question: QUESTION,
    });
    expectOk(post.status === 202, "question was not accepted");
    await pollQuestion(base, metrics, post.body.id);
    const list = await api(base, metrics, "GET", "/questions");
    expectOk(
      list.body.some((item) => item.id === post.body.id),
      "question not listed",
    );
    await batch([
      ["open", base + "/error"],
      ["errors"],
      ["console"],
      ["screenshot", join(dir, "4.png")],
    ]);
  } finally {
    await timed("agent-browser", ["--session", session, "close"]);
    metrics.processes += 1;
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }
  return {};
}

async function loadPlaywright() {
  const attempts = [() => import("playwright")];
  attempts.push(async () => {
    const root = (await timed("npm", ["root", "-g"])).stdout.trim();
    return createRequire(join(root, "x.js"))("playwright");
  });
  for (const attempt of attempts)
    try {
      const module = await attempt();
      return module.chromium ?? module.default?.chromium;
    } catch {}
  return undefined;
}

/** One inline Playwright script: the direct arm of the paired comparison. */
async function runPlaywright(metrics) {
  const chromium = await loadPlaywright();
  if (!chromium) return { skipped: "playwright is not installed" };
  const { child, base } = await startApp();
  metrics.processes += 2; // the app and the script
  metrics.operatorSteps = 1;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(base + "/login");
    await page.getByLabel("Email").fill("agent@example.test");
    await page.getByLabel("Password").fill("wrong-password-value");
    await page.getByRole("button", { name: "Sign in" }).click();
    expectOk(
      (await page.content()).includes("Sign in failed"),
      "refusal not shown",
    );
    await page.screenshot();
    await page.goto(base + "/login");
    await page.getByLabel("Email").click();
    expectOk(
      (await page.evaluate(() =>
        document.activeElement.labels?.[0]?.textContent?.trim(),
      )) === "Email",
      "focus not on Email",
    );
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByLabel("Email").fill("agent@example.test");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    expectOk(
      (await page.locator("h1").innerText()) === "Ask a question",
      "heading differs",
    );
    expectOk(await page.locator("#question").isVisible(), "field hidden");
    expectOk(await page.getByRole("button").isEnabled(), "button disabled");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot();
    const post = await api(base, metrics, "POST", "/questions", {
      question: QUESTION,
    });
    expectOk(post.status === 202, "question was not accepted");
    await pollQuestion(base, metrics, post.body.id);
    const list = await api(base, metrics, "GET", "/questions");
    expectOk(
      list.body.some((item) => item.id === post.body.id),
      "question not listed",
    );
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on(
      "console",
      (message) => message.type() === "error" && errors.push(message.text()),
    );
    await page.goto(base + "/error");
    await page.waitForTimeout(100);
    expectOk(errors.length > 0, "no page error seen");
    await page.screenshot();
  } finally {
    await browser.close();
    child.kill();
  }
  return {};
}

// ---------------------------------------------------------------------------

async function spyglassRepo() {
  return makeRepo({ profile: journeyProfile(), plan: PLAN });
}

const paths = {
  direct: { label: "agent-browser + fetch", run: () => runDirect },
  playwright: { label: "Playwright script", run: () => runPlaywright },
  baseline: {
    label: "Spyglass 1.2.0 (one operation per call)",
    spyglass: runBaseline,
  },
  composite: { label: "Spyglass composite workflow", spyglass: runComposite },
};

async function measure(name) {
  const path = paths[name];
  const samples = [];
  let skipped;
  let counts;
  for (let i = 0; i < runs; i++) {
    const metrics = emptyMetrics();
    let repo;
    const start = performance.now();
    let extra;
    try {
      if (path.spyglass) {
        repo = await spyglassRepo();
        extra = await path.spyglass(repo, metrics);
      } else extra = await path.run()(metrics);
    } finally {
      if (repo) {
        await timed(
          process.execPath,
          [CLI, "--json", "down", "--run", "journey"],
          { cwd: repo, env: { XDG_STATE_HOME: stateHome(repo), ...SECRETS } },
        ).catch(() => undefined);
        await removeRepo(repo);
      }
    }
    if (extra?.skipped) {
      skipped = extra.skipped;
      break;
    }
    samples.push(performance.now() - start);
    counts ??= { ...metrics, ...extra };
  }
  if (skipped) return { path: name, label: path.label, skipped };
  return {
    path: name,
    label: path.label,
    runs: samples.length,
    wallMs: samples.map((ms) => round(ms)),
    wallP50Ms: round(percentile(samples, 50)),
    wallP95Ms: round(percentile(samples, 95)),
    ...counts,
  };
}

await requireBuild();
const results = [];
for (const name of selected) {
  if (!paths[name]) throw new Error(`unknown path ${name}`);
  process.stderr.write(`running ${name}...\n`);
  results.push(await measure(name));
}

const summary = {
  date: today(),
  node: process.version,
  agentBrowser: (await timed("agent-browser", ["--version"])).stdout.trim(),
  claims: CLAIMS.length,
  runs,
  paths: results,
};
console.log(
  table(
    results.map((row) =>
      row.skipped
        ? {
            Path: row.label,
            "Wall p50 (s)": "-",
            "Wall p95 (s)": "-",
            Processes: "-",
            "Operator steps": "-",
            "Stdout bytes": "-",
            "Recorded steps": "-",
            Artifacts: "-",
            "Failed attempts": `skipped: ${row.skipped}`,
          }
        : {
            Path: row.label,
            "Wall p50 (s)": round(row.wallP50Ms / 1000, 2),
            "Wall p95 (s)": round(row.wallP95Ms / 1000, 2),
            Processes: row.processes,
            "Operator steps": row.operatorSteps,
            "Stdout bytes": row.stdoutBytes,
            "Recorded steps": row.recordedSteps ?? "-",
            Artifacts: row.retainedArtifacts ?? "-",
            "Failed attempts": row.failedAttempts ?? "-",
          },
    ),
    [
      "Path",
      "Wall p50 (s)",
      "Wall p95 (s)",
      "Processes",
      "Operator steps",
      "Stdout bytes",
      "Recorded steps",
      "Artifacts",
      "Failed attempts",
    ],
  ),
);
if (write) {
  await mkdir(join(REPO_ROOT, "bench/results"), { recursive: true });
  await writeFile(
    join(
      REPO_ROOT,
      `bench/results/journey-${summary.date}${label ? "-" + label : ""}.json`,
    ),
    JSON.stringify(summary, null, 2) + "\n",
  );
}
