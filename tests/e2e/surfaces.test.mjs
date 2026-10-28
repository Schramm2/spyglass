import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { connect } from "node:net";
import { existsSync } from "node:fs";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { Client } from "pg";
import {
  assertEnvelope,
  baseProfile,
  git,
  makeRepo,
  readRunFile,
  removeRepo,
  runCli,
  runRecord,
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
      assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "ui", "set", "viewport", "390", "844"],
          { env },
        ),
        { ok: true, code: 0 },
      );
      assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "ui", "open", "/dashboard"],
          { env },
        ),
        { ok: true, code: 0 },
      );
      const narrowProof = assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "ui", "proof", "narrow-dashboard"],
          { env },
        ),
        { ok: true, code: 0 },
      );
      const narrowImage = narrowProof.artifacts.find((a) =>
        a.path.endsWith(".png"),
      );
      assert.ok(narrowImage);
      valid.claims[0].steps.push(narrowProof.step);
      valid.claims[0].artifacts.push(narrowImage.path);
      valid.claims[0].inspections = [
        { ...valid.claims[0].inspection, artifact: image.path },
        {
          viewport: "390x844",
          expected: "The page shows the Ask a question form.",
          observed: "The form is visible at the narrow viewport.",
          artifact: narrowImage.path,
        },
      ];
      delete valid.claims[0].inspection;
      await writeJson(resultPath, valid);
      assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "result", "--file", "result.json"],
          { env },
        ),
        { ok: true, code: 0 },
      );
      valid.claims[0].inspections[1].artifact = "spyglass/missing.png";
      await writeJson(resultPath, valid);
      assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "result", "--file", "result.json"],
          { env },
        ),
        { ok: false, code: 1 },
      );
      valid.claims[0].inspections[1].artifact = narrowImage.path;
      await writeJson(resultPath, valid);
      assertEnvelope(
        await runCli(
          dir,
          ["--json", "--run", run, "result", "--file", "result.json"],
          { env },
        ),
        { ok: true, code: 0 },
      );
      assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "down"], { env }),
        { ok: true, code: 0 },
      );
      const report = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "report"], { env }),
        { ok: true, code: 0 },
      );
      const html = await readFile(report.data.reportPath, "utf8");
      const observations = html
        .split("<h2>Visual observations</h2>")[1]
        .split("</section>")[0];
      assert.ok(observations.includes(image.path));
      assert.ok(observations.includes(narrowImage.path));
      assert.match(observations, /1280x800/);
      assert.match(observations, /390x844/);

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

surfaceTest(
  "ui focused names the focused field without its value and fails on another expected label",
  async () => {
    const secret = `focus-secret-${randomUUID()}`;
    const page = await servePage(
      `<label>Email <input id="email"></label><label>Password <input id="password" type="password" value="${secret}"><select><option>Remember me</option></select></label><script>document.getElementById("password").focus()</script>`,
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
      run = assertEnvelope(
        await runCli(dir, ["--json", "up", "--run", "browser-focus"]),
        { ok: true, code: 0 },
      ).run;
      assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "open", "/"]),
        { ok: true, code: 0 },
      );
      const focused = assertEnvelope(
        await runCli(dir, [
          "--json",
          "--run",
          run,
          "ui",
          "focused",
          "--expect",
          "Password",
        ]),
        { ok: true, code: 0 },
      );
      assert.deepEqual(focused.data.focused, {
        tag: "input",
        type: "password",
        label: "Password",
        id: "password",
      });
      assert.equal(focused.data.url, `${page.origin}/`);
      const refusedEval = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "ui", "eval", "1"]),
        { ok: false, code: 2 },
      );
      assert.equal(
        refusedEval.error.code,
        "BROWSER_COMMAND",
        "raw eval stays refused",
      );
      const wrong = assertEnvelope(
        await runCli(dir, [
          "--json",
          "--run",
          run,
          "ui",
          "focused",
          "--expect",
          "Email",
        ]),
        { ok: false, code: 1 },
      );
      assert.equal(wrong.error.code, "BROWSER_EXPECTATION_FAILED");
      const log = await readFile(
        join(dir, ".spyglass/runs", run, "spyglass/log.jsonl"),
        "utf8",
      );
      for (const text of [JSON.stringify(focused), JSON.stringify(wrong), log])
        assert.doesNotMatch(text, new RegExp(secret), "never read the value");
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
      await page.close();
    }
  },
);

surfaceTest(
  "down from the main worktree closes the browser of a run whose worktree was removed",
  async () => {
    const page = await servePage("<h1>Removed worktree</h1>");
    const profile = baseProfile({
      launch: { mode: "none" },
      web: page.origin,
      api: undefined,
      browser: { allowedOrigins: [page.origin] },
    });
    const dir = await makeRepo({ profile });
    const removedTree = `${dir}-removed`;
    const shared = {
      env: { XDG_STATE_HOME: join(tmpdir(), `${basename(dir)}-state`) },
    };
    let run;
    try {
      await git(dir, [
        "worktree",
        "add",
        "-q",
        "--detach",
        removedTree,
        "HEAD",
      ]);
      run = assertEnvelope(
        await runCli(
          removedTree,
          ["--json", "up", "--run", "removed-browser"],
          shared,
        ),
        { ok: true, code: 0 },
      ).run;
      assertEnvelope(
        await runCli(
          removedTree,
          ["--json", "--run", run, "ui", "open", "/"],
          shared,
        ),
        { ok: true, code: 0 },
      );
      assert.ok(
        (await proxyPids(dir)).length,
        "the run browser proxy is running",
      );
      await git(dir, ["worktree", "remove", "--force", removedTree]);
      assertEnvelope(await runCli(dir, ["--json", "--run", run, "down"]), {
        ok: true,
        code: 0,
      });
      await waitFor(async () => !(await proxyPids(dir)).length, {
        message: "down must stop the run browser proxy",
      });
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await rm(removedTree, { recursive: true, force: true });
      await removeRepo(dir);
      await page.close();
    }
  },
);

// Slice 2 of docs/verification-speed.md: ui expect, settle and diagnostics.
async function upBrowserRun(name, { plan, profile } = {}) {
  const dir = await makeRepo({
    profile: profile ?? baseProfile(),
    ...(plan ? { plan } : {}),
  });
  const up = assertEnvelope(
    await runCli(dir, [
      "--json",
      "up",
      "--run",
      name,
      ...(plan ? ["--plan", "plan.json"] : []),
    ]),
    { ok: true, code: 0 },
  );
  return { dir, run: up.run ?? up.data.id };
}
const ui = (dir, run, args, expected = { ok: true, code: 0 }) =>
  runCli(dir, ["--json", "--run", run, "ui", ...args], {
    timeoutMs: 60000,
  }).then((result) => assertEnvelope(result, expected));
const evidenceJson = async (dir, run, artifact) =>
  JSON.parse(
    await readFile(
      join(dir, ".spyglass/runs", run, "spyglass", artifact.path),
      "utf8",
    ),
  );

surfaceTest(
  "ui expect polls inside one call and retains the last observation when a condition never holds",
  async () => {
    const { dir, run } = await upBrowserRun("expect-poll");
    try {
      await ui(dir, run, ["open", "/login?delayed=1"]);
      const passed = await ui(dir, run, [
        "expect",
        "--visible",
        "input[name=email]",
        "--title",
        "Spyglass demo",
        "--url",
        "/login*",
        "--count",
        "input=2",
        "--timeout-ms",
        "5000",
      ]);
      assert.match(passed.data.summary, /^PASS /);
      assert.ok(
        passed.data.polls >= 2,
        "the delayed form needs more than one poll",
      );
      const record = await evidenceJson(
        dir,
        run,
        passed.artifacts.find((a) => a.path.endsWith("expect.json")),
      );
      assert.equal(record.passed, true);
      assert.ok(
        record.conditions.length >= 4 && record.conditions.every((c) => c.ok),
      );
      assert.ok(passed.data.claims.every((claim) => claim.ok === true));

      const started = Date.now();
      const never = await ui(
        dir,
        run,
        ["expect", "--text", "This text never appears", "--timeout-ms", "700"],
        { ok: false, code: 1 },
      );
      assert.equal(never.error.code, "BROWSER_EXPECTATION_FAILED");
      assert.ok(Date.now() - started >= 600, "it polled until the deadline");
      assert.ok(never.data.elapsedMs >= 650);
      assert.equal(never.data.claims[0].ok, false);
      const failed = await evidenceJson(
        dir,
        run,
        never.data.artifacts.find((a) => a.path.endsWith("expect.json")),
      );
      assert.equal(failed.passed, false);
      assert.match(failed.lastObservation.url, /\/login/);
      assert.equal(failed.lastObservation.title, "Spyglass demo");

      // A condition that holds only after its deadline is a failure.
      await ui(dir, run, ["open", "/login?delayed=1"]);
      await ui(
        dir,
        run,
        ["expect", "--visible", "input[name=email]", "--timeout-ms", "100"],
        { ok: false, code: 1 },
      );

      await ui(dir, run, ["open", "/error"]);
      const errors = await ui(
        dir,
        run,
        ["expect", "--no-errors", "--timeout-ms", "800"],
        { ok: false, code: 1 },
      );
      assert.equal(errors.error.code, "BROWSER_EXPECTATION_FAILED");

      const value = await ui(
        dir,
        run,
        ["expect", "--attr", "input:value=secret"],
        { ok: false, code: 2 },
      );
      assert.equal(
        value.error.code,
        "BROWSER_POLICY",
        "input values stay unread",
      );
      const log = await readRunFile(dir, run, "spyglass/log.jsonl");
      assert.ok(
        log.includes(never.step),
        "the failed expectation stays in the log",
      );
    } finally {
      await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "a selector that matches nothing returns the nearest interactive roles and labels",
  async () => {
    const { dir, run } = await upBrowserRun("selector-diagnostics");
    try {
      await ui(dir, run, ["open", "/login"]);
      const miss = await ui(
        dir,
        run,
        ["find", "role", "button", "click", "--name", "Sing in"],
        { ok: false, code: 1 },
      );
      assert.equal(miss.error.code, "BROWSER_COMMAND_FAILED");
      const nearest = miss.data.nearest;
      assert.ok(
        Array.isArray(nearest) && nearest.length > 0 && nearest.length <= 10,
      );
      assert.deepEqual(
        nearest[0],
        { role: "button", name: "Sign in" },
        "the closest name comes first",
      );
      assert.ok(
        nearest.some((row) => row.role === "textbox" && /Email/.test(row.name)),
      );
      const snapshot = miss.data.artifacts.find(
        (a) => a.kind === "page-snapshot",
      );
      assert.ok(snapshot, "the page snapshot is retained");
      assert.match(
        JSON.stringify(await evidenceJson(dir, run, snapshot)),
        /Sign in/,
      );

      const label = await ui(
        dir,
        run,
        ["find", "label", "Emial", "fill", "x"],
        {
          ok: false,
          code: 1,
        },
      );
      assert.ok(label.data.nearest.some((row) => /Email/.test(row.name)));
      assert.ok(
        (await readRunFile(dir, run, "spyglass/log.jsonl")).includes(miss.step),
      );
    } finally {
      await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "ui --settle waits for the navigation that a click starts",
  async () => {
    const { dir, run } = await upBrowserRun("settle");
    try {
      await ui(dir, run, ["open", "/login"]);
      await ui(dir, run, [
        "find",
        "label",
        "Email",
        "fill",
        "agent@example.test",
      ]);
      await ui(dir, run, [
        "find",
        "label",
        "Password",
        "fill",
        "demo-password-for-local-tests",
      ]);
      const click = await ui(dir, run, [
        "find",
        "role",
        "button",
        "click",
        "--name",
        "Sign in",
        "--settle",
      ]);
      assert.ok(click.data.settled, "the step records its settle wait");
      assert.match(click.data.currentUrl, /\/dashboard$/);
      const url = await ui(dir, run, ["get", "url"]);
      assert.match(JSON.stringify(url.data.results), /\/dashboard/);
    } finally {
      await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
    }
  },
);

// Slice 3 of docs/verification-speed.md: ui verify and ui proof --viewport.
const demoSeat = {
  demo: {
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
};
const verifyPlan = {
  claims: [
    {
      id: "form-works",
      behavior: "The dashboard shows its question form.",
      entryPoint: "The dashboard.",
      precondition: "The demo user is signed in.",
      expected: "The form is visible and enabled.",
      case: "Valid demo user.",
      checks: ["browser"],
      evidence: ["verify record"],
      kind: "behavior",
      required: true,
    },
    {
      id: "form-looks-right",
      behavior: "The dashboard fits desktop and phone viewports.",
      entryPoint: "The dashboard.",
      precondition: "The demo user is signed in.",
      expected: "The form is readable at 1280x800 and 390x844.",
      case: "Valid demo user.",
      checks: ["browser"],
      evidence: ["inspected screenshots"],
      kind: "visual",
      required: true,
    },
  ],
  gates: [],
  limits: [],
};
const demoEnv = { DEMO_PASSWORD: "verify-demo-password" };
const uiEnv = (dir, run, args, expected = { ok: true, code: 0 }) =>
  runCli(dir, ["--json", "--run", run, "ui", ...args], {
    env: demoEnv,
    timeoutMs: 60000,
  }).then((result) => assertEnvelope(result, expected));
const pendingFile = async (dir, run) =>
  JSON.parse(await readRunFile(dir, run, "spyglass/result.json"));
const subSteps = (envelope) =>
  envelope.data.subSteps.map(({ id, status }) => `${id}:${status}`);

surfaceTest(
  "ui verify runs actions, expectations and a two-viewport proof as one step and links the claim",
  async () => {
    const dir = await makeRepo({
      profile: baseProfile({ seats: demoSeat }),
      plan: verifyPlan,
    });
    let run;
    try {
      run = assertEnvelope(
        await runCli(
          dir,
          ["--json", "up", "--run", "verify-pass", "--plan", "plan.json"],
          { env: demoEnv },
        ),
        { ok: true, code: 0 },
      ).run;
      await uiEnv(dir, run, ["login", "demo"]);
      const verify = await uiEnv(dir, run, [
        "verify",
        "--open",
        "/dashboard",
        "--do",
        'find label Question fill "Does the settle work?"',
        "--expect",
        "text=Ask a question",
        "--expect",
        "visible=#question",
        "--expect",
        "enabled=button",
        "--expect",
        "title=Questions",
        "--proof",
        "dashboard",
        "--viewport",
        "1280x800",
        "--viewport",
        "390x844",
        "--claim",
        "form-works",
        "--claim",
        "form-looks-right",
      ]);
      assert.deepEqual(subSteps(verify), [
        "open:passed",
        "do-1:passed",
        "expect-1:passed",
        "expect-2:passed",
        "expect-3:passed",
        "expect-4:passed",
        "proof-1280x800:passed",
        "proof-390x844:passed",
      ]);
      assert.ok(verify.data.claims.every((claim) => claim.ok === true));
      const images = verify.artifacts
        .map((a) => a.path)
        .filter((path) => /\.png$/.test(path));
      assert.equal(images.length, 2);
      assert.ok(
        images.some((path) => path.endsWith("proof-dashboard-1280x800.png")),
      );
      assert.ok(
        images.some((path) => path.endsWith("proof-dashboard-390x844.png")),
      );

      const pending = await pendingFile(dir, run);
      const works = pending.claims.find((c) => c.id === "form-works");
      const looks = pending.claims.find((c) => c.id === "form-looks-right");
      assert.deepEqual(works.steps, [verify.step]);
      assert.equal(works.observed, "", "observed stays for the operator");
      assert.equal(works.outcome, "not run");
      assert.deepEqual(
        looks.inspections.map(({ viewport, artifact, expected, observed }) => ({
          viewport,
          artifact,
          expected,
          observed,
        })),
        [
          {
            viewport: "1280x800",
            artifact: images.find((p) => p.includes("1280x800")),
            expected: "",
            observed: "",
          },
          {
            viewport: "390x844",
            artifact: images.find((p) => p.includes("390x844")),
            expected: "",
            observed: "",
          },
        ],
        "viewport and artifact are filled; the words stay for the operator",
      );
      const unobserved = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "result", "--check"]),
        { ok: false, code: 2 },
      );
      assert.ok(
        unobserved.data.findings.some((f) => f.code === "RESULT_SCHEMA"),
      );
    } finally {
      if (run)
        await runCli(dir, ["--json", "--run", run, "down"], { env: demoEnv });
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "ui verify keeps passed sub-steps, fails at the first bad expectation and cannot back a claim",
  async () => {
    const dir = await makeRepo({
      profile: baseProfile({ seats: demoSeat }),
      plan: verifyPlan,
    });
    let run;
    try {
      run = assertEnvelope(
        await runCli(
          dir,
          ["--json", "up", "--run", "verify-fail", "--plan", "plan.json"],
          { env: demoEnv },
        ),
        { ok: true, code: 0 },
      ).run;
      await uiEnv(dir, run, ["login", "demo"]);
      const failed = await uiEnv(
        dir,
        run,
        [
          "verify",
          "--open",
          "/dashboard",
          "--do",
          "find role button click --name 'Submit question'",
          "--expect",
          "text=Ask a question",
          "--expect",
          "text=This text never appears",
          "--expect",
          "visible=#question",
          "--timeout-ms",
          "600",
          "--proof",
          "never",
          "--claim",
          "form-works",
        ],
        { ok: false, code: 1 },
      );
      assert.equal(failed.error.code, "BROWSER_EXPECTATION_FAILED");
      assert.deepEqual(subSteps(failed), [
        "open:passed",
        "do-1:passed",
        "expect-1:passed",
        "expect-2:failed",
        "expect-3:not run",
        "proof:not run",
      ]);
      const artifacts = failed.data.artifacts;
      assert.ok(
        artifacts.some((a) => /\.png$/.test(a.path)),
        "a failure screenshot is kept",
      );
      assert.ok(
        artifacts.some((a) => a.kind === "page-snapshot"),
        "a delta snapshot is kept",
      );
      const pending = await pendingFile(dir, run);
      assert.deepEqual(
        pending.claims.find((c) => c.id === "form-works").steps,
        [],
      );
      assert.ok(
        (await readRunFile(dir, run, "spyglass/log.jsonl")).includes(
          failed.step,
        ),
      );

      await runCli(dir, [
        "--json",
        "--run",
        run,
        "result",
        "set",
        "--claim",
        "form-works",
        "--outcome",
        "passed",
        "--observed",
        "I saw the form.",
        "--step",
        failed.step,
      ]);
      const rejected = assertEnvelope(
        await runCli(dir, ["--json", "--run", run, "result", "--check"]),
        { ok: false, code: 1 },
      );
      const named = rejected.data.findings.filter(
        (f) => f.claim === "form-works",
      );
      assert.ok(
        named.some(
          (f) =>
            f.code === "EXPECTATION_FAILED" &&
            /This text never appears/.test(f.message),
        ),
        JSON.stringify(rejected.data.findings),
      );
      assert.ok(
        named.some(
          (f) =>
            f.code === "EXPECTATION_NOT_RUN" &&
            /visible=#question/.test(f.message),
        ),
        "the expectation that did not run is named",
      );
      assert.ok(named.some((f) => f.code === "FAILED_STEP"));
    } finally {
      if (run)
        await runCli(dir, ["--json", "--run", run, "down"], { env: demoEnv });
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "ui verify refuses an action outside the origin allowlist and keeps the actions that ran",
  async () => {
    const { dir, run } = await upBrowserRun("verify-origin");
    try {
      const blocked = await ui(
        dir,
        run,
        [
          "verify",
          "--open",
          "/login",
          "--do",
          "find label Email fill agent@example.test",
          "--do",
          "open https://example.invalid/",
          "--do",
          "find label Password click",
        ],
        { ok: false, code: 1 },
      );
      assert.equal(blocked.error.code, "BROWSER_ORIGIN_BLOCKED");
      assert.deepEqual(subSteps(blocked), [
        "open:passed",
        "do-1:passed",
        "do-2:failed",
        "do-3:not run",
      ]);
    } finally {
      await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "ui verify --expect-focus-moved keeps both focus records and fails when focus did not move",
  async () => {
    const { dir, run } = await upBrowserRun("verify-focus");
    try {
      const moved = await ui(dir, run, [
        "verify",
        "--open",
        "/login",
        "--do",
        "find label Email click",
        "--expect-focus-moved",
        "Email",
      ]);
      const focus = await evidenceJson(
        dir,
        run,
        moved.artifacts.find((a) => a.path.endsWith("focused.json")),
      );
      assert.equal(focus.before, null);
      assert.equal(focus.after.label, "Email");

      const already = await ui(
        dir,
        run,
        [
          "verify",
          "--do",
          "find label Password click",
          "--expect-focus-moved",
          "Email",
        ],
        { ok: false, code: 1 },
      );
      assert.equal(already.error.code, "BROWSER_EXPECTATION_FAILED");
      const kept = await evidenceJson(
        dir,
        run,
        already.data.artifacts.find((a) => a.path.endsWith("focused.json")),
      );
      assert.equal(
        kept.before.label,
        "Email",
        "focus was on Email before the action",
      );
      assert.equal(kept.after.label, "Password");

      await ui(dir, run, ["open", "/login"]);
      const wrong = await ui(
        dir,
        run,
        [
          "verify",
          "--do",
          "find label Password click",
          "--expect-focus-moved",
          "Email",
        ],
        { ok: false, code: 1 },
      );
      const wrongFocus = await evidenceJson(
        dir,
        run,
        wrong.data.artifacts.find((a) => a.path.endsWith("focused.json")),
      );
      assert.equal(wrongFocus.after.label, "Password");
    } finally {
      await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
    }
  },
);

surfaceTest(
  "a viewport that fails its expectation keeps the earlier screenshots and no visual claim passes",
  async () => {
    const page = await servePage(
      '<!doctype html><title>Responsive</title><style>@media (max-width: 600px){#wide{display:none}}</style><h1 id="wide">Wide layout</h1><p id="always">Always here</p>',
    );
    const plan = {
      claims: [
        {
          id: "layout",
          behavior: "The wide heading shows on every viewport.",
          entryPoint: "The page.",
          precondition: "None.",
          expected: "The heading is visible at 1280x800 and 390x844.",
          case: "Both viewports.",
          checks: ["browser"],
          evidence: ["screenshots"],
          kind: "visual",
          required: true,
        },
      ],
      gates: [],
      limits: [],
    };
    const profile = baseProfile({
      launch: { mode: "none" },
      web: page.origin,
      api: undefined,
      browser: { allowedOrigins: [page.origin] },
    });
    const dir = await makeRepo({ profile, plan });
    let run;
    try {
      run = assertEnvelope(
        await runCli(dir, [
          "--json",
          "up",
          "--run",
          "viewport-fail",
          "--plan",
          "plan.json",
        ]),
        { ok: true, code: 0 },
      ).run;
      const failed = await ui(
        dir,
        run,
        [
          "verify",
          "--open",
          "/",
          "--expect",
          "visible=#wide",
          "--timeout-ms",
          "500",
          "--proof",
          "layout",
          "--viewport",
          "1280x800",
          "--viewport",
          "390x844",
          "--claim",
          "layout",
        ],
        { ok: false, code: 1 },
      );
      assert.equal(failed.error.code, "BROWSER_EXPECTATION_FAILED");
      const images = failed.data.artifacts
        .map((a) => a.path)
        .filter((p) => /\.png$/.test(p));
      assert.ok(
        images.some((p) => p.endsWith("proof-layout-1280x800.png")),
        "the first viewport screenshot stays",
      );
      assert.ok(
        !images.some((p) => p.endsWith("proof-layout-390x844.png")),
        "no proof for the failed viewport",
      );
      assert.equal(images.length, 2, "one proof and one failure screenshot");
      const pending = await pendingFile(dir, run);
      assert.deepEqual(pending.claims[0].steps, []);
      assert.deepEqual(pending.claims[0].inspections, []);
      assert.equal(pending.claims[0].outcome, "not run");

      // ui proof takes the same viewport and expectation options.
      const proof = await ui(dir, run, [
        "proof",
        "again",
        "--viewport",
        "1280x800",
        "--expect",
        "visible=#wide",
      ]);
      assert.ok(
        proof.artifacts.some((a) =>
          a.path.endsWith("proof-again-1280x800.png"),
        ),
      );
      const bad = await ui(
        dir,
        run,
        [
          "proof",
          "phone",
          "--viewport",
          "390x844",
          "--expect",
          "visible=#wide",
          "--timeout-ms",
          "400",
        ],
        { ok: false, code: 1 },
      );
      assert.equal(bad.error.code, "BROWSER_EXPECTATION_FAILED");
    } finally {
      if (run) await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
      await page.close();
    }
  },
);

surfaceTest(
  "a proof right after ui open does not wait for the first browser frame",
  async () => {
    // A new headless page can make its first screenshot wait about 10 seconds.
    for (let attempt = 0; attempt < 6; attempt++) {
      const { dir, run } = await upBrowserRun(`first-frame-${attempt}`);
      try {
        await ui(dir, run, ["open", "/login"]);
        const proof = await ui(dir, run, ["proof", "first-frame"]);
        const log = (await readRunFile(dir, run, "spyglass/log.jsonl"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        const step = log.find((entry) => entry.id === proof.step);
        assert.ok(
          step.durationMs < 5000,
          `attempt ${attempt}: the proof took ${step.durationMs} ms`,
        );
      } finally {
        await runCli(dir, ["--json", "--run", run, "down"]);
        await removeRepo(dir);
      }
    }
  },
);

surfaceTest(
  "the browser proxy stays up when clients reset their connections",
  async () => {
    const { dir, run } = await upBrowserRun("proxy-reset");
    try {
      await ui(dir, run, ["open", "/login"]);
      const record = JSON.parse(
        await readFile(await runRecord(dir, run), "utf8"),
      );
      const { port, pid } = record.browserProxy;
      // A browser resets connections as it starts and as it closes pages.
      for (let i = 0; i < 100; i++)
        await new Promise((resolve) => {
          const socket = connect(port, "127.0.0.1", () => {
            socket.write(
              "CONNECT blocked.example.invalid:443 HTTP/1.1\r\nHost: blocked.example.invalid:443\r\n\r\n",
            );
            socket.resetAndDestroy();
            resolve();
          });
          socket.on("error", () => resolve());
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.doesNotThrow(
        () => process.kill(pid, 0),
        "the proxy process ended",
      );
      await ui(dir, run, ["get", "title"]);
    } finally {
      await runCli(dir, ["--json", "--run", run, "down"]);
      await removeRepo(dir);
    }
  },
);
