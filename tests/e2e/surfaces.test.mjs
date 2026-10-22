import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { Client } from "pg";
import {
  assertEnvelope,
  baseProfile,
  makeRepo,
  removeRepo,
  runCli,
  spawnCapture,
  waitFor,
  writeJson,
} from "./helper.mjs";

const surfacesEnabled = process.env.SPYGLASS_TEST_SURFACES === "1";
const surfaceTest = (name, fn) =>
  test(
    name,
    {
      skip: surfacesEnabled
        ? false
        : "set SPYGLASS_TEST_SURFACES=1 to run real browser and Docker checks",
    },
    fn,
  );

function visualPlan() {
  return {
    claims: [
      {
        id: "dashboard-visible",
        behavior: "A signed-in user can view the question form.",
        entryPoint: "The dashboard in a browser.",
        precondition: "The demo user is signed in.",
        expected: "The page shows the Ask a question form.",
        case: "Valid demo user.",
        checks: ["browser"],
        evidence: ["inspected dashboard screenshot"],
        kind: "visual",
        required: true,
      },
    ],
    gates: [],
    limits: [],
  };
}

surfaceTest(
  "API waits for async work, reads the result independently, and records the side effect",
  async () => {
    const apiToken = `demo-token-${randomUUID()}`;
    const profile = baseProfile({
      seats: { agent: { token: "env:SPYGLASS_TEST_API_TOKEN" } },
    });
    const plan = {
      claims: [
        {
          id: "question-recorded",
          behavior:
            "A submitted question is stored and receives a completed answer.",
          entryPoint: "POST /questions",
          precondition: "The API seat is available.",
          expected: "An independent read returns the completed question.",
          case: "Valid question text.",
          checks: ["submit-question"],
          evidence: ["submission response", "completed independent read"],
          kind: "side-effect",
          required: true,
        },
      ],
      gates: [],
      limits: [],
    };
    const dir = await makeRepo({ profile, plan });
    let run;
    try {
      const up = assertEnvelope(
        await runCli(
          dir,
          ["--json", "up", "--run", "api-async", "--plan", "plan.json"],
          {
            env: { DEMO_TOKEN: apiToken, SPYGLASS_TEST_API_TOKEN: apiToken },
          },
        ),
        { ok: true, code: 0 },
      );
      run = up.run ?? up.data.id;

      const post = assertEnvelope(
        await runCli(
          dir,
          [
            "--json",
            "--run",
            run,
            "api",
            "POST",
            "/questions",
            "--seat",
            "agent",
            "--data",
            JSON.stringify({
              question: "How long does a completed check take?",
            }),
            "--expect",
            "202",
          ],
          { env: { DEMO_TOKEN: apiToken, SPYGLASS_TEST_API_TOKEN: apiToken } },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(post.data.status, 202);
      assert.equal(
        post.data.body.status,
        "pending",
        "202 means accepted work, not completed work",
      );
      const id = post.data.body.id;
      assert.ok(id);

      const secondPost = assertEnvelope(
        await runCli(
          dir,
          [
            "--json",
            "--run",
            run,
            "api",
            "POST",
            "/questions",
            "--seat",
            "agent",
            "--data",
            JSON.stringify({
              question: "Can another accepted request prove completion?",
            }),
            "--expect",
            "202",
          ],
          { env: { DEMO_TOKEN: apiToken, SPYGLASS_TEST_API_TOKEN: apiToken } },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(secondPost.data.body.status, "pending");
      await writeJson(join(dir, "result.json"), {
        operator: "agent",
        claims: [
          {
            id: "question-recorded",
            outcome: "passed",
            steps: [post.step, secondPost.step],
            observed: "The second request was accepted.",
            artifacts: [],
            independentRead: secondPost.step,
          },
        ],
        gates: [],
        limits: [],
      });
      const acceptedIsNotComplete = assertEnvelope(
        await runCli(dir, [
          "--json",
          "--run",
          run,
          "result",
          "--file",
          "result.json",
        ]),
        { ok: false, code: 1 },
      );
      assert.match(
        JSON.stringify(acceptedIsNotComplete.data),
        /INDEPENDENT_READ_MISSING|independent read|completed/i,
      );

      const querySecret = `query-secret-${randomUUID()}`;
      const reflected = assertEnvelope(
        await runCli(
          dir,
          [
            "--json",
            "--run",
            run,
            "api",
            "POST",
            "/reflect",
            "--seat",
            "agent",
            "--data",
            JSON.stringify({
              value: `https://example.invalid/path?access_token=${querySecret}`,
            }),
            "--expect",
            "200",
          ],
          { env: { DEMO_TOKEN: apiToken, SPYGLASS_TEST_API_TOKEN: apiToken } },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(
        JSON.stringify(reflected).includes(querySecret),
        false,
        "sensitive query values must be redacted from the CLI result",
      );
      const status = assertEnvelope(
        await runCli(dir, ["--json", "status", "--run", run]),
        { ok: true, code: 0 },
      );
      const apiArtifact = reflected.artifacts.find(
        (artifact) => artifact.kind === "api",
      );
      assert.ok(
        apiArtifact,
        "API interactions must retain request and response evidence",
      );
      const artifactText = await readFile(
        join(dir, status.data.evidence, apiArtifact.path),
        "utf8",
      );
      assert.equal(
        artifactText.includes(querySecret),
        false,
        "sensitive query values must be redacted from API evidence",
      );

      let read;
      await waitFor(
        async () => {
          read = await runCli(
            dir,
            [
              "--json",
              "--run",
              run,
              "api",
              "GET",
              `/questions/${id}`,
              "--seat",
              "agent",
              "--expect",
              "200",
            ],
            {
              env: { DEMO_TOKEN: apiToken, SPYGLASS_TEST_API_TOKEN: apiToken },
            },
          );
          return read.json?.ok && read.json.data.body.status === "complete";
        },
        {
          timeoutMs: 5000,
          intervalMs: 60,
          message: "the asynchronous question did not complete",
        },
      );
      const get = assertEnvelope(read, { ok: true, code: 0 });
      assert.equal(get.data.body.answer, "Thanks. We received your question.");
      assert.notEqual(
        post.step,
        get.step,
        "the independent read must be a later recorded step",
      );

      const resultPath = join(dir, "result.json");
      await writeJson(resultPath, {
        operator: "agent",
        claims: [
          {
            id: "question-recorded",
            outcome: "passed",
            steps: [post.step, get.step],
            observed: `Question ${id} completed and returned an answer.`,
            artifacts: [],
            independentRead: get.step,
          },
        ],
        gates: [],
        limits: [],
      });
      const recorded = assertEnvelope(
        await runCli(dir, [
          "--json",
          "--run",
          run,
          "result",
          "--file",
          "result.json",
        ]),
        { ok: true, code: 0 },
      );
      assert.equal(recorded.run, run);

      const mismatch = await runCli(
        dir,
        [
          "--json",
          "--run",
          run,
          "api",
          "GET",
          `/questions/${id}`,
          "--seat",
          "agent",
          "--expect",
          "204",
        ],
        { env: { DEMO_TOKEN: apiToken, SPYGLASS_TEST_API_TOKEN: apiToken } },
      );
      const failed = assertEnvelope(mismatch, { ok: false, code: 1 });
      assert.equal(
        failed.data.status,
        200,
        "an expectation failure must retain the real response status",
      );
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "agent-browser uses a fresh allowed session, retains visual proof, and protects login secrets",
  async () => {
    const password = `never-retain-${randomUUID()}`;
    const profile = baseProfile({
      seats: {
        demo: {
          login: {
            path: "/login?delayed=1",
            ready: { selector: 'input[name="email"]' },
            steps: [
              {
                fill: { role: "textbox", name: "Email" },
                value: "agent@example.test",
              },
              { fill: { label: "Password" }, secret: "env:DEMO_PASSWORD" },
              { click: { role: "button", name: "Sign in" } },
            ],
            done: { urlContains: "/dashboard" },
          },
        },
      },
    });
    const dir = await makeRepo({ profile, plan: visualPlan() });
    let run;
    try {
      const version = await spawnCapture("agent-browser", ["--version"]);
      assert.equal(
        version.code,
        0,
        `agent-browser is required for this opt-in test: ${version.stderr}`,
      );
      const env = { DEMO_PASSWORD: password };
      const up = assertEnvelope(
        await runCli(
          dir,
          ["--json", "up", "--run", "browser-proof", "--plan", "plan.json"],
          { env },
        ),
        { ok: true, code: 0 },
      );
      run = up.run ?? up.data.id;

      const open = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/login"], {
          env,
        }),
        { ok: true, code: 0 },
      );
      const browserDoctor = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "doctor"], { env }),
        { ok: true, code: 0 },
      );
      assert.ok(
        browserDoctor.data.browser,
        "doctor must report active browser sessions",
      );
      assert.equal(
        browserDoctor.data.browser.proxy.healthy,
        true,
        "doctor must verify the run-owned browser proxy",
      );
      assert.deepEqual(
        browserDoctor.data.browser.sessions,
        [
          {
            seat: "default",
            namespace: open.data.session.namespace,
            session: open.data.session.name,
            active: true,
          },
        ],
        "doctor must verify the active run-owned browser session",
      );
      const snapshot = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "snapshot"], { env }),
        { ok: true, code: 0 },
      );
      assert.match(JSON.stringify(snapshot.data), /Email/);
      assert.match(JSON.stringify(snapshot.data), /Password/);
      const login = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "login", "demo"], {
          env,
        }),
        { ok: true, code: 0 },
      );
      assert.match(JSON.stringify(login.data), /dashboard/);

      const proof = assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "ui", "proof", "dashboard"],
          { env },
        ),
        { ok: true, code: 0 },
      );
      const image = proof.artifacts.find((artifact) =>
        /\.(png|jpe?g|webp)$/i.test(artifact.path),
      );
      assert.ok(image, "visual proof must retain a screenshot artifact");
      const status = assertEnvelope(
        await runCli(dir, ["--json", "status", "--run", run], { env }),
        { ok: true, code: 0 },
      );
      const evidenceRoot = join(dir, status.data.evidence);
      const originalProofBytes = await readFile(join(evidenceRoot, image.path));
      assert.ok(originalProofBytes.length > 0);
      const repeatedScreenshot = assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "ui", "screenshot", image.path],
          { env },
        ),
        { ok: true, code: 0 },
      );
      assert.notEqual(
        repeatedScreenshot.data.screenshot.path,
        image.path,
        "a new screenshot must get a new owned artifact path",
      );
      assert.deepEqual(
        await readFile(join(evidenceRoot, image.path)),
        originalProofBytes,
        "screenshot must not replace earlier proof bytes",
      );

      const blocked = await runCli(
        dir,
        ["--json", "--run", run, "ui", "open", "https://example.invalid"],
        { env },
      );
      assertEnvelope(blocked, { ok: false });
      const errorPage = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/error"], {
          env,
        }),
        { ok: true, code: 0 },
      );
      const browserErrors = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "errors"], { env }),
        { ok: true, code: 0 },
      );
      assert.match(
        JSON.stringify(browserErrors.data),
        /fixture (page )?error|fixture console error/i,
      );

      const resultPath = join(dir, "result.json");
      await writeJson(resultPath, {
        operator: "human",
        claims: [
          {
            id: "dashboard-visible",
            outcome: "passed",
            steps: [open.step, login.step, proof.step],
            observed: "The signed-in question form is visible.",
            artifacts: [image.path],
          },
        ],
        gates: [],
        limits: [],
      });
      const withoutInspection = await runCli(
        dir,
        ["--json", "--run", run, "result", "--file", "result.json"],
        { env },
      );
      const rejected = assertEnvelope(withoutInspection, {
        ok: false,
        code: 1,
      });
      assert.match(JSON.stringify(rejected.error), /inspection|visual/i);
      const resultText = await readFile(resultPath, "utf8");
      const valid = JSON.parse(resultText);
      valid.claims[0].inspection = {
        viewport: "1280x800",
        expected: "The page shows the Ask a question form.",
        observed:
          "The heading and question form are visible in the screenshot.",
      };
      await writeJson(resultPath, valid);
      assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "result", "--file", "result.json"],
          { env },
        ),
        { ok: true, code: 0 },
      );

      const files = await readdir(evidenceRoot, { recursive: true });
      for (const relative of files) {
        const path = join(evidenceRoot, relative);
        try {
          const content = await readFile(path);
          assert.equal(
            content.includes(Buffer.from(password)),
            false,
            `run evidence exposed the login password in ${relative}`,
          );
        } catch (error) {
          if (error.code !== "EISDIR") throw error;
        }
      }
      assert.ok(existsSync(join(dir, "result.json")));
      assert.ok(errorPage.run === run);
    } finally {
      if (run)
        await runCli(dir, ["--json", "--run", run, "down"], {
          env: { DEMO_PASSWORD: password },
        });
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "browser blocks page navigation to another port on an allowed host before it reaches that port",
  async () => {
    let otherPortHits = 0;
    const otherPort = createServer((request, response) => {
      otherPortHits++;
      response.end("other local service reached");
    });
    await new Promise((resolve, reject) =>
      otherPort.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    const targetPort = otherPort.address().port;
    const app = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        `<a id="other-port" href="http://127.0.0.1:${targetPort}/">Open the other local service</a>`,
      );
    });
    await new Promise((resolve, reject) =>
      app.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${app.address().port}`;
    const profile = baseProfile({
      launch: { mode: "none" },
      web: origin,
      api: undefined,
      browser: { allowedOrigins: [origin] },
    });
    const dir = await makeRepo({ profile });
    let run;
    try {
      const up = assertEnvelope(
        await runCli(dir, ["--json", "up", "--run", "browser-origin-control"]),
        { ok: true, code: 0 },
      );
      run = up.run ?? up.data.id;
      assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"]),
        { ok: true, code: 0 },
      );

      const attempted = await runCli(dir, [
        "--json",
        "--run",
        run,
        "ui",
        "click",
        "#other-port",
      ]);
      if (attempted.json?.ok)
        await runCli(dir, ["--json", "--run", run, "ui", "get", "url"]);
      assert.equal(
        otherPortHits,
        0,
        "the denied service must not receive the page navigation",
      );
      const click = assertEnvelope(attempted, { ok: false, code: 1 });
      assert.equal(click.error.code, "BROWSER_ORIGIN_BLOCKED");
      assert.match(
        click.error.message,
        new RegExp(`127\\.0\\.0\\.1:${targetPort}`),
      );
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
      await Promise.all(
        [app, otherPort].map(
          (server) => new Promise((resolve) => server.close(resolve)),
        ),
      );
    }
  },
);

async function servePage(html) {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function proxyPids(dir) {
  const found = await spawnCapture("pgrep", [
    "-f",
    `browser-proxy.js --serve .*${basename(dir)}-state`,
  ]);
  return found.stdout.split("\n").filter(Boolean);
}

// Read the process list: a session probe would itself reset the idle timer.
async function browserRunning(session) {
  const listed = await spawnCapture("ps", ["axeww", "-o", "command="]);
  return listed.stdout.includes(
    `AGENT_BROWSER_NAMESPACE=${session.namespace} `,
  );
}

async function browserActive(session) {
  const info = await spawnCapture("agent-browser", [
    "--namespace",
    session.namespace,
    "--session",
    session.name,
    "--json",
    "session",
    "info",
  ]);
  return JSON.parse(info.stdout).data.active;
}

surfaceTest(
  "ui wait refuses page JavaScript, downloads and saved state but still waits for page text",
  async () => {
    const page = await servePage(
      '<p id="gone" hidden>Loading</p><h1>Wait fixture</h1>',
    );
    const profile = baseProfile({
      launch: { mode: "none" },
      web: page.origin,
      api: undefined,
      browser: { allowedOrigins: [page.origin] },
    });
    const dir = await makeRepo({ profile });
    let run;
    try {
      const up = assertEnvelope(
        await runCli(dir, ["--json", "up", "--run", "browser-wait"]),
        { ok: true, code: 0 },
      );
      run = up.run ?? up.data.id;
      assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"]),
        { ok: true, code: 0 },
      );
      // agent-browser 0.38.2 reads `wait --state` as the global saved-state
      // file, although its wait help describes an element state.
      for (const option of [
        ["--fn", "document.cookie.length >= 0"],
        ["--download", "saved.bin"],
        ["#gone", "--state", "hidden"],
      ]) {
        const refused = assertEnvelope(
          await runCli(dir, ["--json", "--run", run, "ui", "wait", ...option]),
          { ok: false, code: 2 },
        );
        assert.equal(refused.error.code, "BROWSER_POLICY", option.join(" "));
      }
      assertEnvelope(
        await runCli(dir, [
          "--json",
          "--run",
          run,
          "ui",
          "wait",
          "--text",
          "Wait fixture",
        ]),
        { ok: true, code: 0 },
      );
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
      await page.close();
    }
  },
);

surfaceTest(
  "a screenshot inside a browser batch cannot write outside run evidence",
  async () => {
    const page = await servePage("<h1>Batch fixture</h1>");
    const profile = baseProfile({
      launch: { mode: "none" },
      web: page.origin,
      api: undefined,
      browser: { allowedOrigins: [page.origin] },
    });
    const dir = await makeRepo({ profile });
    const outside = join(dir, "outside-evidence.png");
    let run;
    try {
      run = assertEnvelope(
        await runCli(dir, ["--json", "up", "--run", "browser-batch-shot"]),
        { ok: true, code: 0 },
      ).run;
      assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"]),
        { ok: true, code: 0 },
      );
      const batch = JSON.stringify([
        ["get", "title"],
        ["screenshot", outside],
      ]);
      const refused = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "batch", batch]),
        { ok: false, code: 2 },
      );
      assert.equal(refused.error.code, "BROWSER_POLICY");
      assert.equal(existsSync(outside), false, "the batch wrote a screenshot");
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
      await page.close();
    }
  },
);

surfaceTest(
  "down stops the run browser and proxy when the operator's locale and time zone differ from the ones that started them",
  async (t) => {
    const startLocale = { LC_ALL: "C", LANG: "C", TZ: "UTC" };
    const cleanupLocale = {
      LC_ALL: "en_GB.UTF-8",
      LANG: "en_GB.UTF-8",
      TZ: "America/New_York",
    };
    const startText = async (env) =>
      (
        await spawnCapture("ps", ["-p", String(process.pid), "-o", "lstart="], {
          env,
        })
      ).stdout;
    if ((await startText(startLocale)) === (await startText(cleanupLocale))) {
      t.skip("ps prints the same start time under both settings here");
      return;
    }
    const page = await servePage("<h1>Locale fixture</h1>");
    const profile = baseProfile({
      launch: { mode: "none" },
      web: page.origin,
      api: undefined,
      browser: { allowedOrigins: [page.origin] },
    });
    const dir = await makeRepo({ profile });
    let run;
    try {
      const up = assertEnvelope(
        await runCli(dir, ["--json", "up", "--run", "browser-locale"], {
          env: startLocale,
        }),
        { ok: true, code: 0 },
      );
      run = up.run ?? up.data.id;
      const open = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"], {
          env: startLocale,
        }),
        { ok: true, code: 0 },
      );
      assert.equal((await proxyPids(dir)).length, 1, "ui must start one proxy");

      assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "down"], {
          env: cleanupLocale,
        }),
        { ok: true, code: 0 },
      );
      assert.deepEqual(
        await proxyPids(dir),
        [],
        "down must stop the run-owned proxy started under another locale",
      );
      assert.equal(await browserActive(open.data.session), false);
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      for (const pid of await proxyPids(dir)) process.kill(Number(pid));
      await removeRepo(dir);
      await page.close();
    }
  },
);

surfaceTest(
  "an idle run browser and its proxy shut down, and the next ui command reports the expiry",
  async () => {
    const page = await servePage("<h1>Idle fixture</h1>");
    const profile = baseProfile({
      launch: { mode: "none" },
      web: page.origin,
      api: undefined,
      browser: { allowedOrigins: [page.origin], idleTimeoutMs: 4000 },
    });
    const dir = await makeRepo({ profile });
    let run;
    try {
      const up = assertEnvelope(
        await runCli(dir, ["--json", "up", "--run", "browser-idle"]),
        { ok: true, code: 0 },
      );
      run = up.run ?? up.data.id;
      const open = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"]),
        { ok: true, code: 0 },
      );
      await waitFor(
        async () =>
          !(await browserRunning(open.data.session)) &&
          !(await proxyPids(dir)).length,
        {
          timeoutMs: 30000,
          intervalMs: 500,
          message: "the idle browser and proxy must shut down on their own",
        },
      );

      const doctor = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "doctor"]),
        { ok: true, code: 0 },
      );
      assert.deepEqual(
        doctor.data.browser.sessions.map(({ seat, expired }) => ({
          seat,
          expired,
        })),
        [{ seat: "default", expired: true }],
        "doctor must report the expired seat",
      );
      const expired = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"]),
        { ok: false, code: 3 },
      );
      assert.equal(expired.error.code, "BROWSER_EXPIRED");
      assert.match(expired.error.next, /ui login/);
      assert.equal(
        await browserRunning(open.data.session),
        false,
        "the expired command must not start a signed-out browser",
      );

      const reopened = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"]),
        { ok: true, code: 0 },
      );
      assert.equal(await browserActive(reopened.data.session), true);
      assertEnvelope(await runCli(dir, ["--json", "--run", run, "down"]), {
        ok: true,
        code: 0,
      });
      assert.deepEqual(await proxyPids(dir), []);
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
      await page.close();
    }
  },
);

surfaceTest(
  "Docker and PostgreSQL inspection use a unique project, reject writes, and keep owner services",
  async () => {
    const project = `spyglass-e2e-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const composeArgs = [
      "compose",
      "-p",
      project,
      "-f",
      "fixtures/demo-app/compose.yaml",
    ];
    const profile = baseProfile({
      launch: { mode: "none" },
      compose: {
        project,
        files: ["fixtures/demo-app/compose.yaml"],
        required: ["db"],
      },
      db: { connection: "env:SPYGLASS_TEST_DATABASE_URL" },
    });
    const dir = await makeRepo({ profile });
    let run;
    let composeStarted = false;
    try {
      const version = await spawnCapture("docker", ["compose", "version"]);
      assert.equal(
        version.code,
        0,
        `Docker Compose is required for this opt-in test: ${version.stderr}`,
      );

      const composeUp = await spawnCapture(
        "docker",
        [...composeArgs, "up", "-d", "--wait"],
        { cwd: dir, timeoutMs: 120000 },
      );
      assert.equal(
        composeUp.code,
        0,
        `demo PostgreSQL did not start: ${composeUp.stderr}`,
      );
      composeStarted = true;
      const portResult = await spawnCapture(
        "docker",
        [...composeArgs, "port", "db", "5432"],
        { cwd: dir },
      );
      assert.equal(portResult.code, 0, portResult.stderr);
      const port = Number(portResult.stdout.trim().split(":").at(-1));
      assert.ok(
        port > 0,
        `unexpected mapped PostgreSQL port: ${portResult.stdout}`,
      );
      const connection = `postgres://spyglass:spyglass-demo-only@127.0.0.1:${port}/spyglass_demo`;
      const dbEnv = { SPYGLASS_TEST_DATABASE_URL: connection };

      const up = assertEnvelope(
        await runCli(dir, ["--json", "up", "--run", "db-surface"], {
          env: dbEnv,
        }),
        { ok: true, code: 0 },
      );
      run = up.run ?? up.data.id;

      const mark = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "mark", "before-restart"], {
          env: dbEnv,
        }),
        { ok: true, code: 0 },
      );

      const query = assertEnvelope(
        await runCli(
          dir,
          [
            "--json",
            "--run",
            run,
            "db",
            "SELECT 42::int AS answer",
            "--expect-rows",
            "1",
          ],
          { env: dbEnv },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(query.data.rowCount, 1);
      assert.equal(query.data.rows[0].answer, 42);
      assert.equal(query.data.role.name, "spyglass");
      assert.equal(query.data.role.superuser, true);
      assert.equal(query.data.role.writable, true);

      const settings = assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "db", "SHOW server_version"],
          { env: dbEnv },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(
        settings.data.rowCount,
        1,
        "SHOW must return its result through the extended protocol",
      );
      const explain = assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "db", "EXPLAIN SELECT 42::int AS answer"],
          { env: dbEnv },
        ),
        { ok: true, code: 0 },
      );
      assert.ok(
        explain.data.rowCount > 0,
        "EXPLAIN must return a bounded result",
      );

      const write = await runCli(
        dir,
        [
          "--json",
          "--run",
          run,
          "db",
          "CREATE TABLE spyglass_write_guard(id integer)",
        ],
        { env: dbEnv },
      );
      assertEnvelope(write, { ok: false, code: 1 });
      const guard = assertEnvelope(
        await runCli(
          dir,
          [
            "--json",
            "--run",
            run,
            "db",
            "SELECT to_regclass('public.spyglass_write_guard') AS table_name",
          ],
          { env: dbEnv },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(
        guard.data.rows[0].table_name,
        null,
        "the rejected write must not create a table",
      );

      const multiple = await runCli(
        dir,
        [
          "--json",
          "--run",
          run,
          "db",
          "SELECT 1; CREATE TABLE spyglass_multi_statement(id integer)",
        ],
        { env: dbEnv },
      );
      assertEnvelope(multiple, { ok: false, code: 1 });
      const multipleGuard = assertEnvelope(
        await runCli(
          dir,
          [
            "--json",
            "--run",
            run,
            "db",
            "SELECT to_regclass('public.spyglass_multi_statement') AS table_name",
          ],
          { env: dbEnv },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(
        multipleGuard.data.rows[0].table_name,
        null,
        "a rejected multi-statement query must have no side effect",
      );

      const transactionEscape = await runCli(
        dir,
        [
          "--json",
          "--run",
          run,
          "db",
          "COMMIT; CREATE TABLE spyglass_transaction_escape(id integer)",
        ],
        { env: dbEnv },
      );
      assertEnvelope(transactionEscape, { ok: false, code: 1 });
      const escapeGuard = assertEnvelope(
        await runCli(
          dir,
          [
            "--json",
            "--run",
            run,
            "db",
            "SELECT to_regclass('public.spyglass_transaction_escape') AS table_name",
          ],
          { env: dbEnv },
        ),
        { ok: true, code: 0 },
      );
      assert.equal(
        escapeGuard.data.rows[0].table_name,
        null,
        "the transaction escape attempt must have no side effect",
      );

      const marker = join(dir, "psql-meta-command-ran");
      const meta = await runCli(
        dir,
        ["--json", "--run", run, "db", `\\! touch ${marker}`],
        { env: dbEnv },
      );
      assertEnvelope(meta, { ok: false, code: 1 });
      assert.equal(
        existsSync(marker),
        false,
        "a psql client meta-command must never run",
      );

      const wrongCount = await runCli(
        dir,
        [
          "--json",
          "--run",
          run,
          "db",
          "SELECT 42 AS answer",
          "--expect-rows",
          "2",
        ],
        { env: dbEnv },
      );
      const countFailure = assertEnvelope(wrongCount, { ok: false, code: 1 });
      assert.equal(
        countFailure.data.rowCount,
        1,
        "a failed row-count expectation must retain the observed count",
      );

      const tooManyRows = await runCli(
        dir,
        [
          "--json",
          "--run",
          run,
          "db",
          "SELECT generate_series(1, 1001) AS value",
        ],
        { env: dbEnv },
      );
      assertEnvelope(tooManyRows, { ok: false, code: 1 });

      const tooMuchOutput = await runCli(
        dir,
        ["--json", "--run", run, "db", "SELECT repeat('x', 1100000) AS value"],
        { env: dbEnv },
      );
      const outputFailure = assertEnvelope(tooMuchOutput, {
        ok: false,
        code: 1,
      });
      assert.equal(outputFailure.error.code, "DATABASE_OUTPUT_LIMIT");
      assert.deepEqual(
        outputFailure.data.rows,
        [],
        "oversized rows must not be retained",
      );
      assert.ok(
        Buffer.byteLength(JSON.stringify(outputFailure.data)) <= 1024 * 1024,
        "the retained database result must stay within the output limit",
      );
      assert.ok(
        JSON.stringify(tooMuchOutput.json).length < 10000,
        "the CLI envelope must stay bounded",
      );

      const restart = await spawnCapture(
        "docker",
        [...composeArgs, "restart", "db"],
        { cwd: dir, timeoutMs: 30000 },
      );
      assert.equal(restart.code, 0, restart.stderr);
      await waitFor(
        async () => {
          const health = await spawnCapture(
            "docker",
            [
              ...composeArgs,
              "exec",
              "-T",
              "db",
              "pg_isready",
              "-U",
              "spyglass",
              "-d",
              "spyglass_demo",
            ],
            { cwd: dir },
          );
          return health.code === 0;
        },
        {
          timeoutMs: 15000,
          message: "PostgreSQL did not become healthy after restart",
        },
      );

      const ps = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ps"]),
        { ok: true, code: 0 },
      );
      assert.match(JSON.stringify(ps.data), new RegExp(project));
      assert.match(JSON.stringify(ps.data), /db/);
      const logs = assertEnvelope(
        await runCli(dir, [
          "--json",
          "--run",
          run,
          "logs",
          "db",
          "--since",
          "before-restart",
        ]),
        { ok: true, code: 0 },
      );
      assert.match(JSON.stringify(logs.data), /ready to accept connections/i);
      assert.ok(mark.step);

      await runCli(dir, ["--json", "--run", run, "down"], { env: dbEnv });
      const stillRunning = await spawnCapture(
        "docker",
        [...composeArgs, "ps", "--status", "running", "--services"],
        { cwd: dir },
      );
      assert.equal(stillRunning.code, 0, stillRunning.stderr);
      assert.match(
        stillRunning.stdout,
        /db/,
        "Spyglass cleanup must keep the owner-owned database service",
      );
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      if (composeStarted)
        await spawnCapture("docker", [...composeArgs, "down", "--volumes"], {
          cwd: dir,
          timeoutMs: 30000,
        });
      await removeRepo(dir);
    }
  },
);
