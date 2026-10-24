import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
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
  startCli,
  waitFor,
  writeJson,
} from "./helper.mjs";

const plan = {
  claims: [
    {
      id: "demo-ready",
      behavior: "The demo app responds when it is ready.",
      entryPoint: "GET /health",
      precondition: "The run is ready.",
      expected: "The health response has status ok.",
      case: "The app starts normally.",
      checks: ["health"],
      evidence: ["completed health check"],
      kind: "behavior",
      required: true,
    },
  ],
  gates: [],
  limits: [],
};

test("help works without a profile and explains the main commands and exit codes", async () => {
  const dir = await makeRepo();
  try {
    const result = await runCli(dir, ["--help"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /up/);
    assert.match(result.stdout, /check/);
    assert.match(result.stdout, /ui/);
    assert.match(result.stdout, /exit code/i);
    assert.match(result.stdout, /example/i);
    const schema = assertEnvelope(
      await runCli(dir, ["schema", "result", "--json"]),
      { ok: true, code: 0 },
    );
    assert.equal(
      schema.data.schema.properties.claims.items.required.includes(
        "inspections",
      ),
      false,
    );
  } finally {
    await removeRepo(dir);
  }
});

test("init proposes a profile with discovery provenance without starting the app", async () => {
  const dir = await makeRepo();
  try {
    const result = assertEnvelope(await runCli(dir, ["--json", "init"]), {
      ok: true,
      code: 0,
    });
    assert.ok(
      result.data.profile,
      "init must return the proposed profile path",
    );
    const profilePath = join(dir, result.data.profile);
    assert.equal(existsSync(profilePath), true);
    const profileText = await readFile(profilePath, "utf8");
    assert.match(profileText, /"version"\s*:\s*1/);
    assert.match(profileText, /package\.json/);
    assert.match(profileText, /verify/);
    assert.equal(
      result.run,
      null,
      "profile discovery must not start an app or create a run",
    );
  } finally {
    await removeRepo(dir);
  }
});

test("up, status and down retain one run record and stop only its app", async () => {
  const dir = await makeRepo({ profile: baseProfile(), plan });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, [
        "--json",
        "up",
        "--run",
        "lifecycle",
        "--plan",
        "plan.json",
      ]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    assert.ok(run, "up must identify its run");
    assert.ok(up.data.web, "up must report the ready app address");

    const status = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.equal(status.run, run);
    assert.ok(status.data.source, "status must show the source baseline");
    assert.ok(status.data.evidence, "status must show the evidence folder");
    assert.match(JSON.stringify(status.data), /demo-ready/);

    const down = assertEnvelope(
      await runCli(dir, ["--json", "--run", run, "down"]),
      { ok: true, code: 0 },
    );
    assert.equal(down.run, run);
    const stopped = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.match(JSON.stringify(stopped.data), /stopped|closed|down/i);
    const evidencePath = join(dir, ".spyglass/runs", run);
    assert.equal(
      existsSync(evidencePath),
      true,
      "down must keep the run evidence",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("down stops the owned app when the operator's locale and time zone differ from the ones that started it", async (t) => {
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
  const dir = await makeRepo({ profile: baseProfile() });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "owned-locale"], {
        env: startLocale,
      }),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    assert.equal((await fetch(`${up.data.web}/health`)).status, 200);

    assertEnvelope(
      await runCli(dir, ["--json", "--run", run, "down"], {
        env: cleanupLocale,
      }),
      { ok: true, code: 0 },
    );
    await assert.rejects(
      fetch(`${up.data.web}/health`),
      "down must stop the owned app started under another locale",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("a startup failure returns a run ID and leaves status and cleanup available", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: {
        mode: "owned",
        command: ["node", "-e", "process.exit(9)"],
        ready: {
          url: "http://127.0.0.1:1/health",
          status: 200,
          timeoutMs: 250,
        },
      },
    }),
  });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "startup-fails"]),
      { ok: false },
    );
    run = up.run ?? up.data.id;
    assert.ok(run, "failed startup must return a recorded run ID");
    assert.ok(up.error.code);
    const status = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.equal(status.run, run);
    assert.match(JSON.stringify(status.data), /failed|starting|not ready/i);
    const down = assertEnvelope(
      await runCli(dir, ["--json", "--run", run, "down"]),
      { ok: true, code: 0 },
    );
    assert.equal(down.run, run);
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("exec preserves the child exit and output in the run log", async () => {
  const dir = await makeRepo({ profile: baseProfile() });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "exec-record"]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    const failed = assertEnvelope(
      await runCli(dir, [
        "--json",
        "--run",
        run,
        "exec",
        "--",
        process.execPath,
        "-e",
        'console.log("child output");process.exit(7)',
      ]),
      { ok: false, code: 1 },
    );
    assert.equal(
      failed.data.exitCode,
      7,
      "exec must preserve the actual child exit code",
    );
    assert.match(JSON.stringify(failed.data), /child output/);
    assert.ok(failed.step, "exec must identify the recorded step");
    const terminal = await runCli(dir, [
      "--run",
      run,
      "exec",
      "--",
      process.execPath,
      "-e",
      'console.log("\\u001b[2J\\nstatus: forged")',
    ]);
    assert.equal(terminal.code, 0);
    assert.equal(terminal.stdout.includes("\u001b"), false);
    assert.doesNotMatch(terminal.stdout, /^status: forged/m);

    const lines = (await readRunFile(dir, run, "spyglass/log.jsonl"))
      .trim()
      .split("\n");
    assert.ok(
      lines.length >= 2,
      "the append-only run log must include up and exec",
    );
    const records = lines.map((line) => JSON.parse(line));
    const execRecord = records.find(
      (record) => record.step === failed.step || record.id === failed.step,
    );
    assert.ok(execRecord, "the run log must include the failed exec step");
    assert.ok(execRecord.source, "the recorded step must identify its source");
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("named checks retain failed assertions and automatically import declared artifacts", async () => {
  const profile = baseProfile({
    imports: ["check-output.json"],
    checks: {
      passing: {
        command: ["node", "fixtures/demo-app/check.mjs", "pass"],
        timeoutMs: 3000,
        result: "json",
        artifacts: ["check-output.json"],
      },
      failing: {
        command: ["node", "fixtures/demo-app/check.mjs", "fail"],
        timeoutMs: 3000,
        result: "json",
        artifacts: ["check-output.json"],
      },
    },
  });
  const dir = await makeRepo({ profile });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "named-check"]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;

    const passing = assertEnvelope(
      await runCli(dir, ["--json", "--run", run, "check", "passing"]),
      { ok: true, code: 0 },
    );
    assert.equal(passing.data.exitCode, 0);
    assert.equal(passing.data.claims[0].ok, true);
    const artifact = passing.artifacts.find((item) =>
      item.path.endsWith("check-output.json"),
    );
    assert.ok(
      artifact,
      "the declared check artifact must be imported automatically",
    );
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);

    const failing = assertEnvelope(
      await runCli(dir, ["--json", "--run", run, "check", "failing"]),
      { ok: false, code: 1 },
    );
    assert.equal(
      failing.data.exitCode,
      0,
      "the child exit code and assertion result are separate facts",
    );
    assert.equal(failing.data.claims[0].ok, false);
    assert.match(JSON.stringify(failing.data.skips), /demo-required-case/);
    assert.ok(
      failing.step,
      "a failed assertion must remain a recorded attempt",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("evidence import copies a declared artifact with a checksum and rejects an outside path", async () => {
  const profile = baseProfile({ imports: ["proof.txt"] });
  const dir = await makeRepo({
    profile,
    files: { "proof.txt": "retained proof\n" },
  });
  let run;
  const outside = join(tmpdir(), `spyglass-outside-${randomUUID()}.txt`);
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "artifact-import"]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    const command = assertEnvelope(
      await runCli(dir, [
        "--json",
        "--run",
        run,
        "exec",
        "--",
        process.execPath,
        "-e",
        'console.log("proof produced by this step")',
      ]),
      { ok: true, code: 0 },
    );
    await writeFile(outside, "outside proof\n");

    const add = assertEnvelope(
      await runCli(dir, [
        "--json",
        "--run",
        run,
        "evidence",
        "add",
        "--step",
        command.step,
        "--file",
        "proof.txt",
      ]),
      { ok: true, code: 0 },
    );
    const artifact = add.artifacts.find((item) =>
      item.path.endsWith("proof.txt"),
    );
    assert.ok(artifact, "evidence add must return the copied artifact");
    assert.equal(
      artifact.sha256,
      createHash("sha256").update("retained proof\n").digest("hex"),
    );
    const status = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    const evidence = join(dir, status.data.evidence);
    assert.equal(
      await readFile(join(evidence, artifact.path), "utf8"),
      "retained proof\n",
    );

    const rejected = await runCli(dir, [
      "--json",
      "--run",
      run,
      "evidence",
      "add",
      "--step",
      command.step,
      "--file",
      outside,
    ]);
    assertEnvelope(rejected, { ok: false });
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await unlink(outside).catch(() => {});
    await removeRepo(dir);
  }
});

test("status can inspect a busy run while a second mutation is rejected", async () => {
  const dir = await makeRepo({ profile: baseProfile() });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "lock-check"]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    const active = startCli(dir, [
      "--json",
      "--run",
      run,
      "exec",
      "--",
      process.execPath,
      "-e",
      'setTimeout(()=>console.log("long command done"), 1200)',
    ]);
    await waitFor(
      async () => {
        const status = await runCli(dir, ["--json", "status", "--run", run]);
        return (
          status.json?.ok &&
          /active|exec/i.test(JSON.stringify(status.json.data))
        );
      },
      { timeoutMs: 5000, message: "status did not show the active command" },
    );

    const blocked = await runCli(dir, [
      "--json",
      "--run",
      run,
      "mark",
      "second-operator",
    ]);
    const error = assertEnvelope(blocked, { ok: false });
    assert.match(JSON.stringify(error.error), /busy|lock|active/i);

    const completion = await active.done;
    assert.equal(completion.exit.code, 0, completion.stderr);
    assert.match(completion.stdout, /long command done/);
    assertEnvelope(
      await runCli(dir, ["--json", "--run", run, "mark", "after-command"]),
      { ok: true, code: 0 },
    );
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("a source change blocks later evidence from claiming the original run is current", async () => {
  const dir = await makeRepo({ profile: baseProfile() });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "source-baseline"]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    await writeFile(
      join(dir, "README.md"),
      "# Source changed after the run started\n",
    );

    const stale = assertEnvelope(
      await runCli(dir, [
        "--json",
        "--run",
        run,
        "exec",
        "--",
        process.execPath,
        "-e",
        'console.log("must not become evidence")',
      ]),
      { ok: false, code: 1 },
    );
    assert.match(JSON.stringify(stale.error), /source changed|source.*stale/i);
    assert.doesNotMatch(JSON.stringify(stale.data), /must not become evidence/);
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("up shows the result rules that this plan's claims, controls and gates need", async () => {
  const claim = (id, kind) => ({ ...plan.claims[0], id, kind });
  const ruled = {
    claims: [
      claim("saved", "side-effect"),
      claim("looks", "visual"),
      claim("works", "behavior"),
    ],
    controls: [
      {
        id: "saved-fault",
        claim: "saved",
        expectation: "A broken save is refused.",
        assertion: "health-ready",
      },
      { id: "loose", claim: "works", expectation: "Nothing is declared." },
    ],
    gates: ["verify"],
    limits: [],
  };
  const health = {
    command: [process.execPath, "-e", "console.log('ok')"],
  };
  const dir = await makeRepo({
    profile: baseProfile({ checks: { health } }),
    plan: ruled,
  });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    );
    run = up.run;
    const rules = up.data.resultRules.join("\n");
    for (const [rule, text] of [
      [
        "named check",
        /Claims saved, looks, works: cite a successful step of check health\./,
      ],
      ["undeclared control", /Control loose: claim works, cannot pass/],
      ["side-effect", /saved.*action step and a later read.*independentRead/],
      ["visual", /looks.*inspections.*viewport.*screenshot/],
      ["behavior", /works.*behavior check.*non-image evidence/],
      [
        "controls",
        /failedStep.*restoredStep.*observedFailure.*cites restoredStep/,
      ],
      ["control", /Control saved-fault: claim saved, assertion health-ready/],
      ["gate", /verify.*successful steps.*same source and profile.*binding/],
      ["artifact", /artifact path.*relative to the evidence folder/],
    ])
      assert.match(rules, text, `up must state the ${rule} rule: ${rules}`);
    const template = JSON.parse(
      await readFile(join(dir, up.data.result), "utf8"),
    );
    const field = (id) => template.claims.find((c) => c.id === id);
    assert.equal(field("saved").independentRead, "");
    assert.deepEqual(field("looks").inspections, []);
    assert.equal("independentRead" in field("works"), false);
    assert.equal("inspections" in field("works"), false);
    const text = await runCli(dir, ["--run", run, "status"]);
    assert.match(text.stdout, /resultRules:/);
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("text output keeps the whole next command and the result rules of a plan", async () => {
  const planOf = (claimCount, controlCount, prefix) => ({
    claims: Array.from({ length: claimCount }, (_, index) => ({
      ...plan.claims[0],
      id: `${prefix}claim-${index}`,
      kind: ["behavior", "visual", "side-effect"][index % 3],
    })),
    controls: Array.from({ length: controlCount }, (_, index) => ({
      id: `${prefix}control-${index}`,
      claim: `${prefix}claim-${index}`,
      expectation: "A deliberate fault is detected.",
      assertion: "health-ready",
    })),
    gates: ["lint", "unit", "e2e"],
    limits: [],
  });
  const textUp = async (shape) => {
    const dir = await makeRepo({
      profile: baseProfile({
        checks: { health: { command: [process.execPath, "-e", "0"] } },
      }),
      plan: shape,
    });
    let run;
    try {
      const up = await runCli(dir, ["up", "--plan", "plan.json"]);
      assert.equal(up.code, 0, up.stderr);
      run = up.stdout.match(/^id: (\S+)$/m)?.[1];
      assert.ok(run, up.stdout);
      assert.match(
        up.stdout,
        new RegExp(`^next: spyglass result --file \\S+ --run ${run}$`, "m"),
        up.stdout,
      );
      assert.ok(up.stdout.length < 4000, "text output must stay bounded");
      assert.match(
        up.stdout,
        /^  cleanupRequired: (?:true|false)$/m,
        up.stdout,
      );
      return up.stdout;
    } finally {
      if (run) await runCli(dir, ["--json", "down", "--run", run]);
      await removeRepo(dir);
    }
  };
  // A plan of usual size shows every rule.
  const usual = await textUp(planOf(6, 2, ""));
  assert.match(usual, /- Control control-1: claim claim-1/, usual);
  assert.match(usual, /- Gates lint, unit, e2e: list successful steps/, usual);
  assert.doesNotMatch(usual, /Full rules:/, usual);
  // A long plan cuts the rules and says where the full list is.
  const long = await textUp(planOf(12, 6, "checkout-journey-"));
  assert.match(long, /… Full rules: \S+log\.jsonl/, long);
});

test("an incomplete claim matrix produces a readable report and stays incomplete", async () => {
  const dir = await makeRepo({ profile: baseProfile(), plan });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, [
        "--json",
        "up",
        "--run",
        "pending-claims",
        "--plan",
        "plan.json",
      ]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    assert.ok(
      up.data.result,
      "up must return the pending result template path",
    );
    assert.equal(existsSync(join(dir, up.data.result)), true);

    const report = assertEnvelope(
      await runCli(dir, ["--json", "--run", run, "report"]),
      { ok: false, code: 1 },
    );
    assert.match(JSON.stringify(report.data), /demo-ready/);
    const evidence = join(dir, ".spyglass/runs", run);
    const files = await readdir(evidence, { recursive: true });
    assert.ok(
      files.some((file) => String(file).endsWith("index.html")),
      "an incomplete report must still include index.html",
    );
    assert.ok(
      files.some((file) => String(file).endsWith("summary.json")),
      "an incomplete report must still include summary.json",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("a result cannot pass a required claim with no completed step or evidence", async () => {
  const dir = await makeRepo({ profile: baseProfile(), plan });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, [
        "--json",
        "up",
        "--run",
        "missing-proof",
        "--plan",
        "plan.json",
      ]),
      { ok: true, code: 0 },
    );
    run = up.run ?? up.data.id;
    const resultPath = join(dir, "result.json");
    await writeJson(resultPath, {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [],
          observed: "It looked fine.",
          artifacts: [],
        },
      ],
      gates: [],
      limits: [],
    });
    const result = assertEnvelope(
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
    assert.match(JSON.stringify(result.error), /step|evidence|proof/i);
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("an invalid profile returns a structured error before launch", async () => {
  const dir = await makeRepo({ profile: { ...baseProfile(), version: 99 } });
  try {
    const result = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "invalid-profile"]),
      { ok: false, code: 2 },
    );
    assert.match(JSON.stringify(result.error), /version|profile/i);
    assert.ok(result.error.next);
  } finally {
    await removeRepo(dir);
  }
});

test("unknown options fail before allocating a run and JSON remains parseable", async () => {
  const dir = await makeRepo({ profile: baseProfile() });
  try {
    const bad = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "invalid-option", "--typo"]),
      { ok: false, code: 2 },
    );
    assert.match(JSON.stringify(bad.error), /option|argument/i);
    const list = assertEnvelope(await runCli(dir, ["--json", "status"]), {
      ok: true,
      code: 0,
    });
    assert.equal(list.data.runs.length, 0);
  } finally {
    await runCli(dir, ["--json", "down", "--run", "invalid-option"]);
    await removeRepo(dir);
  }
});

test("doctor never advances a changed source baseline", async () => {
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
  });
  let run;
  try {
    const up = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    });
    run = up.run;
    await writeFile(join(dir, "README.md"), "changed\n");
    for (let i = 0; i < 2; i++) {
      const stale = assertEnvelope(
        await runCli(dir, ["--json", "doctor", "--run", run]),
        { ok: false, code: 1 },
      );
      assert.match(JSON.stringify(stale.error), /source/i);
    }
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a timed out named check retains its failure and allows cleanup", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      checks: {
        hang: {
          command: [process.execPath, "-e", "setTimeout(()=>{},30000)"],
          timeoutMs: 100,
        },
      },
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    const failed = assertEnvelope(
      await runCli(dir, ["--json", "check", "hang", "--run", run]),
      { ok: false, code: 1 },
    );
    assert.equal(failed.data.exitCode, 124);
    assert.ok(failed.step);
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("stopped runs reject drive commands and keep diagnostic commands", async () => {
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    assertEnvelope(await runCli(dir, ["--json", "down", "--run", run]), {
      ok: true,
      code: 0,
    });
    assertEnvelope(
      await runCli(dir, [
        "--json",
        "exec",
        "--run",
        run,
        "--",
        process.execPath,
        "-e",
        'console.log("should not run")',
      ]),
      { ok: false },
    );
    assertEnvelope(await runCli(dir, ["--json", "status", "--run", run]), {
      ok: true,
      code: 0,
    });
  } finally {
    await removeRepo(dir);
  }
});

test("external readiness is checked without starting or stopping the owner", async () => {
  const marker = ".spyglass/owner-doctor.txt";
  const dir = await makeRepo({
    profile: baseProfile({
      launch: {
        mode: "external",
        doctor: [
          process.execPath,
          "-e",
          `require('fs').writeFileSync('${marker}','doctor ran');console.log(JSON.stringify({ok:true,build:'fixture-v1'}))`,
        ],
      },
      web: undefined,
      api: undefined,
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    assert.equal(await readFile(join(dir, marker), "utf8"), "doctor ran");
    const down = assertEnvelope(
      await runCli(dir, ["--json", "down", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.equal(down.data.ownerCleanupRequired, true);
    assert.equal(existsSync(join(dir, marker)), true);
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("ambiguous profiles and missing runs have actionable errors without a prompt", async () => {
  const dir = await makeRepo({
    profile: baseProfile(),
    files: {
      ".agents/skills/verify-demo/spyglass.json": JSON.stringify(baseProfile()),
    },
  });
  try {
    const missing = assertEnvelope(await runCli(dir, ["--json", "doctor"]), {
      ok: false,
      code: 2,
    });
    assert.match(missing.error.message, /run/i);
    const ambiguous = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: false,
      code: 2,
    });
    assert.match(ambiguous.error.code, /AMBIGUOUS/);
    assert.match(ambiguous.error.next, /profile/);
  } finally {
    await removeRepo(dir);
  }
});

test("a report validates completed proof after cleanup and detects artifact tampering", async () => {
  const profile = baseProfile({
    launch: { mode: "none" },
    checks: {
      health: {
        command: [process.execPath, "-e", 'console.log("health observed")'],
      },
    },
  });
  const dir = await makeRepo({ profile, plan });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const check = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.ok(check.artifacts.length);
    const pending = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.deepEqual(pending.data.pendingClaims, ["demo-ready"]);
    assert.match(
      pending.data.next,
      /^spyglass result --file \S+result\.json --run /,
      "a pending claim must lead to result, not cleanup",
    );
    const passingResult = {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [check.step],
          observed: "The declared health command completed.",
          artifacts: check.artifacts.map((a) => a.path),
        },
      ],
      gates: [],
      limits: [],
    };
    await writeJson(join(dir, pending.data.result), passingResult);
    const unrecorded = assertEnvelope(
      await runCli(dir, ["--json", "report", "--run", run]),
      { ok: false, code: 1 },
    );
    assert.ok(
      unrecorded.data.findings.some((f) => f.code === "RESULT_MISSING"),
      "an edited template that was never submitted through result is not proof",
    );
    await writeJson(join(dir, "result.json"), passingResult);
    assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: true, code: 0 },
    );
    const recorded = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.deepEqual(recorded.data.pendingClaims, []);
    assert.equal(recorded.data.next, `spyglass down --run ${run}`);
    assertEnvelope(await runCli(dir, ["--json", "report", "--run", run]), {
      ok: false,
      code: 1,
    });
    assertEnvelope(await runCli(dir, ["--json", "down", "--run", run]), {
      ok: true,
      code: 0,
    });
    const complete = assertEnvelope(
      await runCli(dir, ["--json", "report", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.ok(
      isAbsolute(complete.data.reportPath) &&
        existsSync(complete.data.reportPath),
      `report must print a path that opens from any directory: ${complete.data.reportPath}`,
    );
    const status = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.equal(status.data.next, `spyglass report --run ${run}`);
    await writeFile(
      join(dir, status.data.evidence, check.artifacts[0].path),
      "tampered",
    );
    for (let i = 0; i < 2; i++) {
      const bad = assertEnvelope(
        await runCli(dir, ["--json", "report", "--run", run]),
        { ok: false, code: 1 },
      );
      assert.match(JSON.stringify(bad), /checksum|altered|integrity|changed/i);
    }
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("status exposes capabilities and supports a handoff without chat context", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
      checks: {
        verify: {
          command: [process.execPath, "-e", 'console.log("verified")'],
        },
      },
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    await runCli(dir, ["--json", "check", "verify", "--run", run]);
    const status = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.equal(status.data.capabilities.ui.available, false);
    assert.equal(status.data.capabilities.check.available, true);
    assert.ok(status.data.completedChecks.some((c) => c.name === "verify"));
    assert.match(status.data.next, /down|report/);
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("profiles reject literal credentials before creating a run", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      seats: { bad: { token: "literal-test-token" } },
      db: { connection: "postgres://user:literal-pass@localhost/demo" },
    }),
  });
  try {
    const bad = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "literal-secret-control"]),
      { ok: false, code: 2 },
    );
    assert.doesNotMatch(JSON.stringify(bad), /literal-test-token|literal-pass/);
    assert.match(JSON.stringify(bad.error), /reference|token|connection/);
  } finally {
    await runCli(dir, ["--json", "down", "--run", "literal-secret-control"]);
    await removeRepo(dir);
  }
});

test("a reflected credential is masked even when its text starts like a secret reference", async () => {
  const secret = "reflected-check-secret-41";
  const profile = baseProfile({
    launch: { mode: "none" },
    web: undefined,
    api: undefined,
    browser: undefined,
    checks: {
      reflect: {
        command: [
          "node",
          "-e",
          "const t=process.env.TOKEN;console.log(JSON.stringify({ok:true,claims:[{id:'reflect',ok:true,detail:'file: '+t},{id:'plain',ok:true,detail:'echo '+t}]}))",
        ],
        env: { TOKEN: "file:token.txt" },
        result: "json",
      },
    },
  });
  const dir = await makeRepo({ profile, files: { "token.txt": secret } });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "reflected-secret"]),
      { ok: true, code: 0 },
    ).run;
    const check = await runCli(dir, [
      "--json",
      "--run",
      run,
      "check",
      "reflect",
    ]);
    assertEnvelope(check, { ok: true, code: 0 });
    const log = await readRunFile(dir, run, "spyglass/log.jsonl");
    for (const [where, text] of [
      ["stdout", check.stdout],
      ["stderr", check.stderr],
      ["run log", log],
    ])
      assert.ok(!text.includes(secret), `${where} exposes the check secret`);
    assert.match(check.stdout, /file: \[REDACTED\]/);
    assert.match(check.stdout, /echo \[REDACTED\]/);
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("negative controls require the declared failed assertion followed by its restored pass", async () => {
  const profile = baseProfile({
    launch: { mode: "none" },
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
  const controlPlan = {
    ...plan,
    controls: [
      {
        id: "health-control",
        claim: "demo-ready",
        expectation: "The demo assertion detects its deliberate failure.",
        assertion: "demo-check",
      },
    ],
  };
  const dir = await makeRepo({ profile, plan: controlPlan });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const fail = assertEnvelope(
      await runCli(dir, ["--json", "check", "fail", "--run", run]),
      { ok: false, code: 1 },
    );
    const pass = assertEnvelope(
      await runCli(dir, ["--json", "check", "pass", "--run", run]),
      { ok: true, code: 0 },
    );
    const result = {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [pass.step],
          observed: "The declared assertion passed.",
          artifacts: pass.artifacts.map((a) => a.path),
        },
      ],
      gates: [],
      limits: [],
      controls: [
        {
          id: "health-control",
          failedStep: pass.step,
          restoredStep: pass.step,
          observedFailure: "Deliberate failure.",
          observedPass: "Restored assertion passed.",
        },
      ],
    };
    await writeJson(join(dir, "result.json"), result);
    const wrong = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(JSON.stringify(wrong), /control|assertion/i);
    result.controls[0].failedStep = fail.step;
    result.controls[0].observedFailure = " ";
    result.controls[0].observedPass = "";
    await writeJson(join(dir, "result.json"), result);
    const unobserved = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(JSON.stringify(unobserved), /observ/i);
    result.controls[0].observedFailure = "The declared assertion failed.";
    result.controls[0].observedPass =
      "The same assertion passed after restoration.";
    await writeJson(join(dir, "result.json"), result);
    assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: true, code: 0 },
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("long status text is cut with a pointer to the full JSON result", async () => {
  const manyClaims = {
    ...plan,
    claims: Array.from({ length: 80 }, (_, index) => ({
      ...plan.claims[0],
      id: `pending-claim-with-a-long-name-${index}`,
    })),
  };
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
    plan: manyClaims,
  });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const human = await runCli(dir, ["status", "--run", run]);
    assert.equal(human.code, 0);
    assert.ok(human.stdout.length < 4000, "human status must stay bounded");
    assert.match(
      human.stdout,
      /Full result: rerun with --json/,
      "status records no step, so its full result is only in --json output",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "--run", run, "down"]);
    await removeRepo(dir);
  }
});

test("text and JSON modes keep the same exit status and text gives a short next action", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      checks: {
        pass: {
          command: [process.execPath, "-e", 'console.log("observed pass")'],
        },
        fail: {
          command: [
            process.execPath,
            "-e",
            'console.error("observed failure");process.exit(9)',
          ],
        },
      },
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    for (const [name, code] of [
      ["pass", 0],
      ["fail", 1],
    ]) {
      const structured = await runCli(dir, [
        "--json",
        "check",
        name,
        "--run",
        run,
      ]);
      assertEnvelope(structured, { ok: code === 0, code });
      const human = await runCli(dir, ["check", name, "--run", run]);
      assert.equal(human.code, code);
      assert.match(human.stdout + human.stderr, /observed/);
    }
    const human = await runCli(dir, ["status", "--run", run]);
    assert.equal(human.code, 0);
    assert.ok(human.stdout.length < 3000, "human status must be short");
    assert.match(human.stdout, /spyglass (down|report)/);
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("concurrent allocation of one run name creates exactly one run", async () => {
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
  });
  try {
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () =>
        runCli(dir, ["--json", "up", "--run", "same-run"]),
      ),
    );
    assert.equal(
      attempts.filter((r) => r.code === 0).length,
      1,
      "exactly one operator must allocate the run",
    );
    assert.ok(
      attempts
        .filter((r) => r.code !== 0)
        .every((r) => r.code === 2 || r.code === 3),
    );
  } finally {
    await runCli(dir, ["--json", "down", "--run", "same-run"]);
    await removeRepo(dir);
  }
});

test("different runs cannot overwrite a shared evidence folder", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      evidence: ".spyglass/fixed",
    }),
  });
  try {
    assertEnvelope(await runCli(dir, ["--json", "up", "--run", "first"]), {
      ok: true,
      code: 0,
    });
    const second = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "second"]),
      { ok: false },
    );
    assert.match(JSON.stringify(second.error), /evidence|owned|claim/i);
    assertEnvelope(await runCli(dir, ["--json", "status", "--run", "first"]), {
      ok: true,
      code: 0,
    });
  } finally {
    await runCli(dir, ["--json", "down", "--run", "first"]);
    await runCli(dir, ["--json", "down", "--run", "second"]);
    await removeRepo(dir);
  }
});

test("JSON checks reject empty and malformed assertion rows", async () => {
  const profile = baseProfile({
    launch: { mode: "none" },
    checks: {
      empty: {
        command: [
          process.execPath,
          "-e",
          "console.log(JSON.stringify({ok:true,claims:[]}))",
        ],
        result: "json",
      },
      malformed: {
        command: [
          process.execPath,
          "-e",
          'console.log(JSON.stringify({ok:true,claims:[{id:"health",ok:"yes"}]}))',
        ],
        result: "json",
      },
    },
  });
  const dir = await makeRepo({ profile });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    for (const name of ["empty", "malformed"]) {
      const attempt = assertEnvelope(
        await runCli(dir, ["--json", "check", name, "--run", run]),
        { ok: false, code: 1 },
      );
      assert.equal(
        attempt.data.passed,
        false,
        `${name} JSON must not pass without valid structured assertions`,
      );
      assert.ok(attempt.step);
    }
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a failed required named check cannot be replaced by an unrelated successful command", async () => {
  const profile = baseProfile({
    launch: { mode: "none" },
    checks: {
      health: { command: [process.execPath, "-e", "process.exit(7)"] },
    },
  });
  const dir = await makeRepo({ profile, plan });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const failed = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", run]),
      { ok: false, code: 1 },
    );
    const unrelated = assertEnvelope(
      await runCli(dir, [
        "--json",
        "exec",
        "--run",
        run,
        "--",
        process.execPath,
        "-e",
        'console.log("unrelated command passed")',
      ]),
      { ok: true, code: 0 },
    );
    const result = {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [failed.step, unrelated.step],
          observed: "The unrelated command completed.",
          artifacts: unrelated.artifacts.map((item) => item.path),
        },
      ],
      gates: [],
      limits: [],
    };
    await writeJson(join(dir, "result.json"), result);
    const rejected = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(rejected.data),
      /NAMED_CHECK_FAILED|failed required check|no successful attempt/i,
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a cleanup-only named check cannot prove a behavior claim", async () => {
  const profile = baseProfile({
    launch: { mode: "none" },
    checks: {
      health: {
        command: [process.execPath, "-e", 'console.log("cleanup completed")'],
        cleanup: true,
      },
    },
  });
  const dir = await makeRepo({ profile, plan });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const cleanup = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", run]),
      { ok: true, code: 0 },
    );
    await writeJson(join(dir, "result.json"), {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [cleanup.step],
          observed: "The cleanup command completed.",
          artifacts: cleanup.artifacts.map((item) => item.path),
        },
      ],
      gates: [],
      limits: [],
    });
    const rejected = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(rejected.data),
      /BEHAVIOR_PROOF_MISSING|behavior|cleanup/i,
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("an imported screenshot alone cannot prove a behavior claim", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=",
    "base64",
  );
  const profile = baseProfile({
    launch: { mode: "none" },
    imports: ["proof.png"],
  });
  const dir = await makeRepo({ profile, plan, files: { "proof.png": png } });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const producer = assertEnvelope(
      await runCli(dir, [
        "--json",
        "exec",
        "--run",
        run,
        "--",
        process.execPath,
        "-e",
        'console.log("capture source")',
      ]),
      { ok: true, code: 0 },
    );
    const imported = assertEnvelope(
      await runCli(dir, [
        "--json",
        "evidence",
        "--run",
        run,
        "add",
        "--step",
        producer.step,
        "--file",
        "proof.png",
      ]),
      { ok: true, code: 0 },
    );
    const image = imported.artifacts.find((item) => item.kind === "image");
    assert.ok(image, "the screenshot fixture must be retained as an image");
    await writeJson(join(dir, "result.json"), {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [imported.step],
          observed: "The screenshot shows the expected behavior.",
          artifacts: [image.path],
        },
      ],
      gates: [],
      limits: [],
    });
    const rejected = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(rejected.data),
      /BEHAVIOR_PROOF_MISSING|behavior|screenshot/i,
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a claim cannot cite an artifact produced by a step it does not cite", async () => {
  const profile = baseProfile({
    launch: { mode: "none" },
    checks: {
      health: {
        command: [process.execPath, "-e", 'console.log("health observed")'],
      },
      extra: {
        command: [process.execPath, "-e", 'console.log("unrelated proof")'],
      },
    },
  });
  const dir = await makeRepo({ profile, plan });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const health = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", run]),
      { ok: true, code: 0 },
    );
    const extra = assertEnvelope(
      await runCli(dir, ["--json", "check", "extra", "--run", run]),
      { ok: true, code: 0 },
    );
    const unrelated = extra.artifacts[0];
    assert.ok(unrelated);
    await writeJson(join(dir, "result.json"), {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [health.step],
          observed: "The health check passed.",
          artifacts: [unrelated.path],
        },
      ],
      gates: [],
      limits: [],
    });
    const rejected = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(rejected.data),
      /ARTIFACT_PRODUCER_MISMATCH|producer|cited step/i,
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("down stops owned descendants that ignore the first termination signal", async () => {
  const launchCode = `const {spawn}=require('child_process');const fs=require('fs');const c=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('.spyglass/descendant.pid',String(c.pid));setInterval(()=>{},1000)`;
  const dir = await makeRepo({
    profile: baseProfile({
      launch: {
        mode: "owned",
        command: [process.execPath, "-e", launchCode],
        ready: {
          command: [
            process.execPath,
            "-e",
            "process.exit(require('fs').existsSync('.spyglass/descendant.pid')?0:1)",
          ],
          timeoutMs: 3000,
        },
      },
    }),
  });
  let run;
  let pid;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    pid = Number(await readFile(join(dir, ".spyglass/descendant.pid"), "utf8"));
    await new Promise((r) => setTimeout(r, 120));
    assertEnvelope(await runCli(dir, ["--json", "down", "--run", run]), {
      ok: true,
      code: 0,
    });
    await waitFor(
      () => {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          return true;
        }
      },
      { timeoutMs: 3000, message: "owned descendant survived cleanup" },
    );
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("source identity includes submodule worktree changes", async () => {
  const { execFileSync } = await import("node:child_process");
  const library = await makeRepo();
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
  });
  let run;
  try {
    execFileSync(
      "git",
      [
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "--quiet",
        library,
        "library",
      ],
      { cwd: dir },
    );
    execFileSync("git", ["commit", "-qm", "add library"], { cwd: dir });
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    await writeFile(
      join(dir, "library/README.md"),
      "changed library behavior\n",
    );
    const stale = assertEnvelope(
      await runCli(dir, ["--json", "doctor", "--run", run]),
      { ok: false, code: 1 },
    );
    assert.match(JSON.stringify(stale.error), /source|library/);
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
    await removeRepo(library);
  }
});

test("unreadable source fails verification instead of becoming a stable missing input", async () => {
  const { chmod } = await import("node:fs/promises");
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
  });
  const file = join(dir, "README.md");
  try {
    await chmod(file, 0);
    const bad = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "unreadable"]),
      { ok: false, code: 3 },
    );
    assert.match(JSON.stringify(bad.error), /source|read|permission/i);
  } finally {
    await chmod(file, 0o600);
    await runCli(dir, ["--json", "down", "--run", "unreadable"]);
    await removeRepo(dir);
  }
});

test("readiness rejects a structured owner failure even when its command exits zero", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: {
        mode: "external",
        ready: {
          command: [
            process.execPath,
            "-e",
            'console.log(JSON.stringify({ok:false,reason:"not migrated"}))',
          ],
          timeoutMs: 150,
        },
      },
    }),
  });
  try {
    const bad = assertEnvelope(
      await runCli(dir, ["--json", "up", "--run", "owner-not-ready"]),
      { ok: false },
    );
    assert.match(JSON.stringify(bad), /ready|migration|migrated/i);
  } finally {
    await runCli(dir, ["--json", "down", "--run", "owner-not-ready"]);
    await removeRepo(dir);
  }
});

test("init exposes owner guidance before proposing a framework launch", async () => {
  const dir = await makeRepo({
    files: {
      "package.json": JSON.stringify({
        scripts: {
          dev: "next dev",
          verify: "node fixtures/demo-app/check.mjs pass",
        },
      }),
      ".agents/skills/verify-owned/SKILL.md":
        "---\nname: verify-owned\ndescription: Verify owned app.\n---\n# Launch\nUse the existing owner for an isolated installation.\n\n```sh\npython scripts/owner.py up\n```\n",
    },
  });
  try {
    const init = assertEnvelope(await runCli(dir, ["--json", "init"]), {
      ok: true,
      code: 0,
    });
    const profile = JSON.parse(
      await readFile(join(dir, init.data.profile), "utf8"),
    );
    assert.equal(
      profile.launch.mode,
      "none",
      "discovery must leave owner setup with its existing instructions",
    );
    assert.match(profile.skill, /verify-owned/);
    assert.match(JSON.stringify(init.data), /owner|guidance/i);
  } finally {
    await removeRepo(dir);
  }
});

test("each command help includes its own usage without a run or profile", async () => {
  const dir = await makeRepo();
  try {
    for (const command of [
      "init",
      "up",
      "doctor",
      "down",
      "api",
      "db",
      "exec",
      "check",
      "result",
      "report",
      "evidence",
      "status",
      "mark",
      "logs",
      "ps",
    ]) {
      const result = await runCli(dir, [command, "--help"]);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Usage: spyglass ${command}`));
      assert.match(result.stdout, /Example:/);
    }
  } finally {
    await removeRepo(dir);
  }
});

test("run evidence retains its profile, plan and tool identity for a handoff", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
    }),
    plan,
  });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    );
    run = up.run;
    const profileArtifact = up.artifacts.find((a) =>
      a.path.endsWith("profile.json"),
    );
    const planArtifact = up.artifacts.find((a) => a.path.endsWith("plan.json"));
    assert.ok(profileArtifact, "up must retain the resolved profile");
    assert.ok(planArtifact, "up must retain the original claim plan");
    const records = (await readRunFile(dir, run, "spyglass/log.jsonl"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(records[0].run, run);
    assert.equal(records[0].tool.version, "1.2.0");
    assert.match(records[0].profileHash, /^[a-f0-9]{64}$/);
    const doctor = assertEnvelope(
      await runCli(dir, ["--json", "doctor", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.equal(doctor.data.environment.evidenceIgnored, true);
    assert.match(doctor.data.environment.tools.node, /^v24\./);
    assert.equal(
      doctor.data.environment.tools.browser,
      undefined,
      "a command-only profile does not need a browser",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("engine assertions remain distinct from domain counts and nested response flags", async () => {
  const owner = {
    ok: true,
    checks: [
      {
        claim: "unchanged record is skipped",
        ok: true,
        detail: { added: 0, skipped: 8, failed: 0 },
      },
    ],
    steps: [
      {
        action: "add unchanged records",
        result: { skipped: 8, failed: 0, success: false },
      },
    ],
  };
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      checks: {
        add: {
          command: [
            process.execPath,
            "-e",
            `console.log(${JSON.stringify(JSON.stringify(owner))})`,
          ],
          result: "engine",
        },
      },
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["--json", "up"]), {
      ok: true,
      code: 0,
    }).run;
    const check = assertEnvelope(
      await runCli(dir, ["--json", "check", "add", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.deepEqual(check.data.skips, []);
    assert.equal(
      check.data.claims[0].detail.skipped,
      8,
      "domain observations must remain retained",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a declared command control matches the intended failure and the same restored command", async () => {
  const args = [
    "--",
    process.execPath,
    "-e",
    `const fs=require('fs');if(!fs.existsSync('.spyglass/restored')){console.error('expected button absent');process.exit(4)}console.log('expected button present')`,
  ];
  const matrix = {
    ...plan,
    claims: [{ ...plan.claims[0], checks: ["exec"] }],
    controls: [
      {
        id: "command-control",
        claim: "demo-ready",
        expectation: "The command detects the missing button.",
        command: ["exec", ...args],
        failure: { code: "COMMAND_FAILED", contains: "expected button absent" },
      },
    ],
  };
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
    plan: matrix,
  });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const bad = assertEnvelope(
      await runCli(dir, ["--json", "exec", "--run", run, ...args]),
      { ok: false, code: 1 },
    );
    await writeFile(join(dir, ".spyglass/restored"), "restored");
    const good = assertEnvelope(
      await runCli(dir, ["--json", "exec", "--run", run, ...args]),
      { ok: true, code: 0 },
    );
    const result = {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [good.step],
          observed: "The expected button is present.",
          artifacts: good.artifacts.map((a) => a.path),
        },
      ],
      controls: [
        {
          id: "command-control",
          failedStep: bad.step,
          restoredStep: good.step,
          observedFailure: "Expected button absent.",
          observedPass: "Expected button present.",
        },
      ],
      gates: [],
      limits: [],
    };
    await writeJson(join(dir, "result.json"), result);
    assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: true, code: 0 },
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a defect control links a retained failing source run to a restored candidate", async () => {
  const matrix = {
    ...plan,
    controls: [
      {
        id: "baseline",
        claim: "demo-ready",
        expectation: "Health must pass after the fix.",
        assertion: "health",
      },
    ],
  };
  const command = [
    process.execPath,
    "-e",
    `const ok=require('fs').readFileSync('README.md','utf8').includes('fixed');console.log(JSON.stringify({ok,claims:[{id:'health',ok}]}))`,
  ];
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      checks: { health: { command, result: "json" } },
    }),
    plan: matrix,
  });
  let baseline, candidate;
  try {
    baseline = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const bad = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", baseline]),
      { ok: false, code: 1 },
    );
    await runCli(dir, ["--json", "down", "--run", baseline]);
    await writeFile(join(dir, "README.md"), "fixed\n");
    candidate = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const good = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", candidate]),
      { ok: true, code: 0 },
    );
    await writeJson(join(dir, "result.json"), {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [good.step],
          observed: "Health passes after the source fix.",
          artifacts: good.artifacts.map((a) => a.path),
        },
      ],
      controls: [
        {
          id: "baseline",
          failedRun: baseline,
          failedStep: bad.step,
          restoredStep: good.step,
          observedFailure: "Health failed before the fix.",
          observedPass: "Health passed after the fix.",
        },
      ],
      gates: [],
      limits: [],
    });
    assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        candidate,
        "--file",
        "result.json",
      ]),
      { ok: true, code: 0 },
    );
    await runCli(dir, ["--json", "down", "--run", candidate]);
    const report = assertEnvelope(
      await runCli(dir, ["--json", "report", "--run", candidate]),
      { ok: true, code: 0 },
    );
    assert.match(JSON.stringify(report), new RegExp(baseline));
  } finally {
    for (const run of [baseline, candidate])
      if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("repeated reports retain history without recursively embedding previous reports", async () => {
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
    plan,
  });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    await runCli(dir, ["--json", "down", "--run", run]);
    let previous = 0;
    for (let i = 0; i < 4; i++) {
      const report = assertEnvelope(
        await runCli(dir, ["--json", "report", "--run", run]),
        { ok: false, code: 1 },
      );
      assert.equal(
        report.data.attempts,
        undefined,
        "full attempt history belongs in the retained artifact, not normal output",
      );
      const file = report.artifacts.find((a) => a.kind === "report");
      const bytes = Buffer.byteLength(
        await readRunFile(dir, run, "spyglass/" + file.path),
      );
      if (i > 1)
        assert.ok(
          bytes < previous * 1.8,
          "report size must not grow exponentially",
        );
      previous = bytes;
    }
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("report detects a changed commit even when source file bytes are unchanged", async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = await makeRepo({
    profile: baseProfile({ launch: { mode: "none" } }),
    plan,
  });
  let run;
  try {
    run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    await runCli(dir, ["--json", "down", "--run", run]);
    execFileSync(
      "git",
      ["commit", "--allow-empty", "-qm", "new commit identity"],
      { cwd: dir },
    );
    const report = assertEnvelope(
      await runCli(dir, ["--json", "report", "--run", run]),
      { ok: false, code: 1 },
    );
    assert.ok(
      report.data.findings.some((f) => f.code === "STALE_SOURCE"),
      "a new commit must invalidate the baseline identity",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("init records discovery sources and exposes capabilities without launching tools", async () => {
  const dir = await makeRepo({
    files: {
      "README.md": "# Development\nRun npm run verify.\n",
      "compose.yaml": "services:\n  app:\n    image: local-example\n",
      ".agents/skills/verify-demo/SKILL.md":
        "# Verify demo\nRead features/README.md.\n",
      ".agents/skills/verify-demo/features/README.md":
        "# Features\nVerify health.\n",
    },
  });
  try {
    const result = assertEnvelope(await runCli(dir, ["init", "--json"]), {
      ok: true,
      code: 0,
    });
    for (const path of [
      "README.md",
      "compose.yaml",
      "package.json",
      ".agents/skills/verify-demo/SKILL.md",
      ".agents/skills/verify-demo/features/README.md",
    ])
      assert.ok(
        result.data.discovery.some((s) => s.path === path && s.sha256),
        "missing discovery source " + path,
      );
    assert.equal(result.data.capabilities.check.available, true);
    assert.equal(result.data.capabilities.ui.available, false);
    assert.equal(result.run, null);
  } finally {
    await removeRepo(dir);
  }
});

test("a failed owner doctor with child exit zero cannot pass a repository gate", async () => {
  const matrix = { claims: [], gates: ["owner-ready"], limits: [] };
  const dir = await makeRepo({
    profile: baseProfile({
      launch: {
        mode: "external",
        doctor: [
          process.execPath,
          "-e",
          "console.log(JSON.stringify({ok:false}))",
        ],
      },
      web: undefined,
      api: undefined,
    }),
    plan: matrix,
  });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: false, code: 1 },
    );
    run = up.run;
    await writeJson(join(dir, "result.json"), {
      operator: "agent",
      claims: [],
      gates: [{ name: "owner-ready", outcome: "passed", steps: [up.step] }],
      limits: [],
    });
    assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        run,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    const records = (await readRunFile(dir, run, "spyglass/log.jsonl"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(records[0].exitCode, 0, "retain actual child exit");
    assert.equal(
      records[0].data.passed,
      false,
      "retain failed command outcome separately",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("exec forwards child version flags instead of treating them as Spyglass flags", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["up", "--json"]), {
      ok: true,
      code: 0,
    }).run;
    const child = assertEnvelope(
      await runCli(dir, [
        "exec",
        "--run",
        run,
        "--json",
        "--",
        process.execPath,
        "--version",
      ]),
      { ok: true, code: 0 },
    );
    assert.ok(child.step);
    assert.match(child.data.stdout, /^v24\./);
    assertEnvelope(
      await runCli(dir, [
        "exec",
        "--run",
        run,
        "--json",
        "--",
        "spyglass-no-such-tool",
        "--version",
      ]),
      { ok: false, code: 3 },
    );
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("a named check retains distinct artifacts that have the same basename", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
      imports: ["output"],
      checks: {
        both: {
          command: [
            process.execPath,
            "-e",
            'console.log("observed both results")',
          ],
          artifacts: ["output/a/result.json", "output/b/result.json"],
        },
      },
    }),
    files: {
      "output/a/result.json": '{"value":1}',
      "output/b/result.json": '{"value":2}',
    },
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["up", "--json"]), {
      ok: true,
      code: 0,
    }).run;
    const check = assertEnvelope(
      await runCli(dir, ["check", "both", "--run", run, "--json"]),
      { ok: true, code: 0 },
    );
    const results = check.artifacts.filter((a) =>
      a.path.endsWith("result.json"),
    );
    assert.equal(new Set(results.map((a) => a.path)).size, 2);
    for (let i = 0; i < 2; i++)
      assert.equal(
        JSON.parse(await readRunFile(dir, run, "spyglass/" + results[i].path))
          .value,
        i + 1,
      );
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("a configured database with a missing secret cannot report ready", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
      db: { connection: "env:SPYGLASS_DEFINITELY_MISSING_DB" },
    }),
  });
  let run;
  try {
    const up = assertEnvelope(await runCli(dir, ["up", "--json"]), {
      ok: false,
      code: 3,
    });
    run = up.run;
    assert.match(up.error.code, /SECRET_UNAVAILABLE/);
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("a refused concurrent command never rewrites the run state file", async () => {
  const { stat } = await import("node:fs/promises");
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["up", "--json"]), {
      ok: true,
      code: 0,
    }).run;
    const running = startCli(dir, [
      "exec",
      "--run",
      run,
      "--json",
      "--",
      process.execPath,
      "-e",
      "setTimeout(()=>{},3000)",
    ]);
    await waitFor(async () =>
      Boolean(
        (await runCli(dir, ["status", "--run", run, "--json"])).json?.data
          .active,
      ),
    );
    const stateBase = join(
      tmpdir(),
      dir.split("/").at(-1) + "-state",
      "spyglass",
    );
    const roots = await readdir(stateBase);
    const stateFile = join(stateBase, roots[0], run, "run.json");
    const before = (await stat(stateFile)).mtimeMs;
    assertEnvelope(
      await runCli(dir, ["mark", "blocked", "--run", run, "--json"]),
      { ok: false, code: 3 },
    );
    assert.equal(
      (await stat(stateFile)).mtimeMs,
      before,
      "lock refusal must not write stale state",
    );
    await running.done;
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("a failed launch child cannot borrow readiness from another server", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => res.end("healthy foreign server"));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const dir = await makeRepo({
    profile: baseProfile({
      launch: {
        mode: "owned",
        command: ["spyglass-no-such-launch-tool"],
        ready: { url: `http://127.0.0.1:${port}`, timeoutMs: 2000 },
      },
      web: undefined,
      api: undefined,
    }),
  });
  let run;
  try {
    const up = assertEnvelope(await runCli(dir, ["up", "--json"]), {
      ok: false,
    });
    run = up.run;
    assert.match(JSON.stringify(up.error), /launch|child|exit|app/i);
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await new Promise((r) => server.close(r));
    await removeRepo(dir);
  }
});

test("handoff output distinguishes command failure, keeps source compact and prepares controls", async () => {
  const matrix = {
    ...plan,
    controls: [
      {
        id: "known-fault",
        claim: "demo-ready",
        expectation: "The health assertion fails deliberately.",
        assertion: "health",
      },
    ],
  };
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
      checks: {
        health: {
          command: [
            process.execPath,
            "-e",
            'console.log(JSON.stringify({ok:false,claims:[{id:"health",ok:false}]}))',
          ],
          result: "json",
        },
      },
    }),
    plan: matrix,
  });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, ["up", "--plan", "plan.json", "--json"]),
      { ok: true, code: 0 },
    );
    run = up.run;
    assert.equal(up.data.source.files, undefined);
    assert.ok(up.data.source.fileCount > 0);
    const template = JSON.parse(
      await readRunFile(dir, run, "spyglass/result.json"),
    );
    assert.equal(template.controls[0].id, "known-fault");
    assert.equal(template.controls[0].failedRun, run);
    await runCli(dir, ["check", "health", "--run", run, "--json"]);
    const status = assertEnvelope(
      await runCli(dir, ["status", "--run", run, "--json"]),
      { ok: true, code: 0 },
    );
    const check = status.data.completedChecks[0];
    assert.equal(check.exitCode, 0);
    assert.equal(check.commandExitCode, 1);
    assert.equal(check.childExitCode, 0);
    assert.equal(check.spyglassExitCode, 1);
    assert.equal(check.status, "failed");
    const text = await runCli(dir, ["status", "--run", run]);
    assert.equal(text.code, 0);
    assert.match(text.stdout, /childExitCode: 0/);
    assert.match(text.stdout, /spyglassExitCode: 1/);
    assert.equal(text.stdout.trim().startsWith("{"), false);
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("owned launch refuses unavailable process inspection before starting its child", async () => {
  const { chmod } = await import("node:fs/promises");
  const dir = await makeRepo({
    profile: baseProfile({
      launch: {
        mode: "owned",
        command: [
          process.execPath,
          "-e",
          'require("fs").writeFileSync(".spyglass/started",String(process.ppid));setTimeout(()=>{},60000)',
        ],
        ready: { command: [process.execPath, "-e", "setTimeout(()=>{},100)"] },
      },
      web: undefined,
      api: undefined,
    }),
    files: { "bin/ps": "#!/bin/sh\nexit 1\n" },
  });
  let run;
  try {
    await chmod(join(dir, "bin/ps"), 0o755);
    const result = await runCli(dir, ["up", "--json"], {
      env: { PATH: join(dir, "bin") + ":" + process.env.PATH },
    });
    run = result.json?.run;
    const failed = assertEnvelope(result, { ok: false, code: 3 });
    assert.equal(failed.error.code, "PROCESS_INSPECTION_FAILED");
    assert.equal(
      existsSync(join(dir, ".spyglass/started")),
      false,
      "a launch without process ownership must not start its child",
    );
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    // The pre-fix failure leaves an unrecorded supervisor; its own child writes its PID.
    const marker = join(dir, ".spyglass/started");
    if (existsSync(marker)) {
      const pid = Number(await readFile(marker, "utf8"));
      if (pid > 1)
        try {
          process.kill(-pid, "SIGKILL");
        } catch {}
    }
    await removeRepo(dir);
  }
});

test("a state permission failure is distinct from an active run lock", async () => {
  const { chmod } = await import("node:fs/promises");
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
    }),
  });
  let run, stateDir;
  try {
    run = assertEnvelope(await runCli(dir, ["up", "--json"]), {
      ok: true,
      code: 0,
    }).run;
    const stateBase = join(
      tmpdir(),
      dir.split("/").at(-1) + "-state",
      "spyglass",
    );
    const roots = await readdir(stateBase);
    stateDir = join(stateBase, roots[0], run);
    await chmod(stateDir, 0o500);
    const failed = assertEnvelope(
      await runCli(dir, ["mark", "denied", "--run", run, "--json"]),
      { ok: false, code: 3 },
    );
    assert.equal(
      failed.error.code,
      "LOCK_UNAVAILABLE",
      "permission errors must not tell an agent to wait for another operator",
    );
    assert.match(failed.error.next, /permission|access/i);
  } finally {
    if (stateDir) await chmod(stateDir, 0o700);
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("CLI binding overrides are retained and used by named checks", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
      bindings: {
        installation: "${run}",
        ownerEvidence: "evidence/${installation}",
      },
      checks: {
        binding: {
          command: [
            process.execPath,
            "-e",
            "console.log(process.argv[1])",
            "${installation}",
          ],
        },
      },
    }),
  });
  let run;
  try {
    const up = assertEnvelope(
      await runCli(dir, [
        "up",
        "--run",
        "binding-candidate",
        "--binding",
        "installation=existing-owner",
        "--binding",
        "extra=kept",
        "--json",
      ]),
      { ok: true, code: 0 },
    );
    run = up.run;
    assert.equal(up.data.owner.bindings.installation, "existing-owner");
    assert.equal(
      up.data.owner.bindings.ownerEvidence,
      "evidence/existing-owner",
    );
    assert.equal(up.data.owner.bindings.extra, "kept");
    const check = assertEnvelope(
      await runCli(dir, ["check", "binding", "--run", run, "--json"]),
      { ok: true, code: 0 },
    );
    assert.match(check.data.stdout, /existing-owner/);
    const status = assertEnvelope(
      await runCli(dir, ["status", "--run", run, "--json"]),
      { ok: true, code: 0 },
    );
    assert.equal(status.data.owner.bindings.installation, "existing-owner");
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("exec applies its explicit deadline and preserves child timeout arguments", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      web: undefined,
      api: undefined,
    }),
  });
  let run;
  try {
    run = assertEnvelope(await runCli(dir, ["up", "--json"]), {
      ok: true,
      code: 0,
    }).run;
    const failed = assertEnvelope(
      await runCli(dir, [
        "exec",
        "--run",
        run,
        "--timeout-ms",
        "50",
        "--json",
        "--",
        process.execPath,
        "-e",
        "setTimeout(()=>{},1000)",
      ]),
      { ok: false, code: 1 },
    );
    assert.equal(failed.data.timedOut, true);
    assert.equal(failed.data.exitCode, 124);
    const passed = assertEnvelope(
      await runCli(dir, [
        "exec",
        "--run",
        run,
        "--timeout-ms",
        "2000",
        "--json",
        "--",
        process.execPath,
        "-e",
        "setTimeout(()=>console.log(process.argv[1]),100)",
        "--",
        "--timeout-ms",
      ]),
      { ok: true, code: 0 },
    );
    assert.match(passed.data.stdout, /--timeout-ms/);
    for (const value of ["0", "-1", "NaN", "86400001", "1.5"]) {
      const invalid = assertEnvelope(
        await runCli(dir, [
          "exec",
          "--run",
          run,
          "--timeout-ms",
          value,
          "--json",
          "--",
          process.execPath,
          "-e",
          "console.log('must not execute')",
        ]),
        { ok: false, code: 2 },
      );
      assert.doesNotMatch(JSON.stringify(invalid.data), /must not execute/);
    }
  } finally {
    if (run) await runCli(dir, ["down", "--run", run, "--json"]);
    await removeRepo(dir);
  }
});

test("a control links a failed run from a fault worktree to the candidate in the main worktree", async () => {
  const matrix = {
    ...plan,
    controls: [
      {
        id: "readme-fault",
        claim: "demo-ready",
        expectation: "Health fails when the README loses its title.",
        assertion: "health",
      },
    ],
  };
  const command = [
    process.execPath,
    "-e",
    `const ok=require('fs').readFileSync('README.md','utf8').includes('Isolated');console.log(JSON.stringify({ok,claims:[{id:'health',ok}]}))`,
  ];
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      checks: { health: { command, result: "json" } },
    }),
    plan: matrix,
  });
  const faultTree = `${dir}-fault`;
  // Each worktree must use the one state home that the main worktree uses.
  const shared = {
    env: { XDG_STATE_HOME: join(tmpdir(), `${basename(dir)}-state`) },
  };
  let fault, candidate;
  try {
    await git(dir, ["worktree", "add", "-q", "--detach", faultTree, "HEAD"]);
    await writeFile(join(faultTree, "README.md"), "# Broken\n");
    fault = assertEnvelope(
      await runCli(faultTree, ["--json", "up", "--plan", "plan.json"], shared),
      { ok: true, code: 0 },
    ).run;
    const bad = assertEnvelope(
      await runCli(
        faultTree,
        ["--json", "check", "health", "--run", fault],
        shared,
      ),
      { ok: false, code: 1 },
    );
    candidate = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    const listed = assertEnvelope(await runCli(dir, ["--json", "status"]), {
      ok: true,
      code: 0,
    });
    assert.ok(
      listed.data.runs.some((item) => item.id === fault),
      "the main worktree lists the fault worktree's run",
    );
    const foreign = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", fault]),
      { ok: false, code: 2 },
    );
    assert.equal(foreign.error.code, "RUN_OTHER_WORKTREE");
    assert.match(foreign.error.message, new RegExp(basename(faultTree)));
    assertEnvelope(
      await runCli(faultTree, ["--json", "down", "--run", fault], shared),
      { ok: true, code: 0 },
    );
    const good = assertEnvelope(
      await runCli(dir, ["--json", "check", "health", "--run", candidate]),
      { ok: true, code: 0 },
    );
    const result = {
      operator: "agent",
      claims: [
        {
          id: "demo-ready",
          outcome: "passed",
          steps: [good.step],
          observed: "Health passes on the restored source.",
          artifacts: good.artifacts.map((a) => a.path),
        },
      ],
      controls: [
        {
          id: "readme-fault",
          failedRun: fault,
          failedStep: bad.step,
          restoredStep: good.step,
          observedFailure: "Health failed in the fault worktree.",
          observedPass: "Health passed in the main worktree.",
        },
      ],
      gates: [],
      limits: [],
    };
    await writeJson(join(dir, "result.json"), result);
    assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        candidate,
        "--file",
        "result.json",
      ]),
      { ok: true, code: 0 },
    );
    await git(dir, ["worktree", "remove", "--force", faultTree]);
    const lost = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        candidate,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(lost),
      new RegExp(`evidence folder .*${basename(faultTree)}.* no longer exists`),
    );
  } finally {
    if (fault)
      await runCli(faultTree, ["--json", "down", "--run", fault], shared).catch(
        () => undefined,
      );
    if (candidate) await runCli(dir, ["--json", "down", "--run", candidate]);
    await rm(faultTree, { recursive: true, force: true });
    await removeRepo(dir);
  }
});

test("a gate from another run counts only on the same source, profile and used bindings", async () => {
  const matrix = { claims: [], gates: ["verify"], limits: [] };
  const dir = await makeRepo({
    profile: baseProfile({
      launch: { mode: "none" },
      // A per-run binding must not make every other run's gate a mismatch.
      bindings: {
        database: "app_${run}",
        target: "one",
        dsn: "db://${target}",
        apiPort: "4100",
      },
      api: "http://127.0.0.1:${apiPort}/api",
      checks: {
        "verify-target": {
          command: [process.execPath, "-e", "console.log(process.env.DSN)"],
          env: { DSN: "${dsn}" },
        },
        "verify-api": {
          command: [process.execPath, "-e", "console.log(process.env.API)"],
          env: { API: "${api}" },
        },
      },
    }),
    plan: matrix,
  });
  const runsCreated = [];
  const start = async () => {
    const run = assertEnvelope(
      await runCli(dir, ["--json", "up", "--plan", "plan.json"]),
      { ok: true, code: 0 },
    ).run;
    runsCreated.push(run);
    return run;
  };
  const record = (run, gateRun, step) =>
    writeJson(join(dir, "result.json"), {
      operator: "agent",
      claims: [],
      gates: [
        { name: "verify", outcome: "passed", run: gateRun, steps: [step] },
      ],
      limits: [],
    }).then(() =>
      runCli(dir, ["--json", "result", "--run", run, "--file", "result.json"]),
    );
  try {
    const gateRun = await start();
    const gate = assertEnvelope(
      await runCli(dir, [
        "--json",
        "exec",
        "--run",
        gateRun,
        "--",
        process.execPath,
        "-e",
        "console.log('gate ok')",
      ]),
      { ok: true, code: 0 },
    );
    const sameSource = await start();
    assertEnvelope(await record(sameSource, gateRun, gate.step), {
      ok: true,
      code: 0,
    });
    await writeFile(join(dir, "README.md"), "# Changed source\n");
    const changedSource = await start();
    const refused = assertEnvelope(
      await record(changedSource, gateRun, gate.step),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(refused),
      /Gate verify cites run .* on a different source identity/,
    );
    await writeFile(join(dir, "README.md"), "# Isolated Spyglass fixture\n");
    const failedGate = assertEnvelope(
      await runCli(dir, [
        "--json",
        "exec",
        "--run",
        gateRun,
        "--",
        process.execPath,
        "-e",
        "process.exit(3)",
      ]),
      { ok: false, code: 1 },
    );
    const restored = await start();
    assertEnvelope(await record(restored, gateRun, failedGate.step), {
      ok: false,
      code: 1,
    });
    const unknown = assertEnvelope(
      await record(restored, "no-such-run", gate.step),
      { ok: false, code: 1 },
    );
    assert.match(JSON.stringify(unknown), /Gate verify cites run no-such-run/);
    const checkGate = assertEnvelope(
      await runCli(dir, ["--json", "check", "--run", gateRun, "verify-target"]),
      { ok: true, code: 0 },
    );
    const apiGate = assertEnvelope(
      await runCli(dir, ["--json", "check", "--run", gateRun, "verify-api"]),
      { ok: true, code: 0 },
    );
    const startWith = async (...bindings) => {
      const run = assertEnvelope(
        await runCli(dir, [
          "--json",
          "up",
          "--plan",
          "plan.json",
          ...bindings.flatMap((binding) => ["--binding", binding]),
        ]),
        { ok: true, code: 0 },
      ).run;
      runsCreated.push(run);
      return run;
    };
    // An installation's own port is a binding that no gate command uses.
    const ownPort = await startWith("apiPort=4101");
    assertEnvelope(await record(ownPort, gateRun, gate.step), {
      ok: true,
      code: 0,
    });
    assertEnvelope(await record(ownPort, gateRun, checkGate.step), {
      ok: true,
      code: 0,
    });
    // A check that reads ${api} reads apiPort through the profile's api.
    const otherApi = assertEnvelope(
      await record(ownPort, gateRun, apiGate.step),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(otherApi),
      /whose step .* used binding apiPort with a different value/,
    );
    // The named check reads target through dsn, so another target refuses it.
    const otherTarget = await startWith("target=two");
    assertEnvelope(await record(otherTarget, gateRun, gate.step), {
      ok: true,
      code: 0,
    });
    const mismatch = assertEnvelope(
      await record(otherTarget, gateRun, checkGate.step),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(mismatch),
      /Gate verify cites run .* whose step .* used binding target with a different value/,
    );
    // An override value can name another binding: dsn reads host here.
    const hostA = await startWith("dsn=db://${host}", "host=a");
    const hostGate = assertEnvelope(
      await runCli(dir, ["--json", "check", "--run", hostA, "verify-target"]),
      { ok: true, code: 0 },
    );
    const hostB = await startWith("dsn=db://${host}", "host=b");
    const otherHost = assertEnvelope(
      await record(hostB, hostA, hostGate.step),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(otherHost),
      /whose step .* used binding host with a different value/,
    );
    const runJson = await runRecord(dir, gateRun);
    const original = await readFile(runJson, "utf8");
    const withoutProfile = async () => {
      const stored = JSON.parse(original);
      delete stored.rawProfile;
      await writeFile(runJson, JSON.stringify(stored));
    };
    const refusedOn = async (run, step, name) =>
      assert.match(
        JSON.stringify(
          assertEnvelope(await record(run, gateRun, step), {
            ok: false,
            code: 1,
          }),
        ),
        new RegExp(`whose step .* used binding ${name} with a different value`),
      );
    // A run from 1.1.0 kept no profile: the unchanged file gives the names.
    await withoutProfile();
    assertEnvelope(await record(ownPort, gateRun, checkGate.step), {
      ok: true,
      code: 0,
    });
    await refusedOn(otherTarget, checkGate.step, "target");
    // The run keeps its own profile, so an edited file changes nothing.
    await writeFile(runJson, original);
    await writeJson(
      join(dir, "spyglass.json"),
      baseProfile({ launch: { mode: "none" } }),
    );
    assertEnvelope(await record(otherTarget, gateRun, gate.step), {
      ok: true,
      code: 0,
    });
    await refusedOn(otherTarget, checkGate.step, "target");
    // A stored profile that does not hash to the run's profile is not used.
    const tampered = JSON.parse(original);
    tampered.rawProfile.bindings.target = "two";
    await writeFile(runJson, JSON.stringify(tampered));
    assert.match(
      JSON.stringify(
        assertEnvelope(await record(otherTarget, gateRun, gate.step), {
          ok: false,
          code: 1,
        }),
      ),
      /whose profile file is no longer the one it hashed/,
    );
    // Without either, every changed binding counts.
    await withoutProfile();
    const unread = assertEnvelope(
      await record(otherTarget, gateRun, gate.step),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(unread),
      /whose profile file is no longer the one it hashed, so every changed binding counts: target/,
    );
  } finally {
    for (const run of runsCreated)
      await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a binding of a launch that Spyglass owns blocks every cited gate step", async () => {
  const dir = await makeRepo({
    profile: baseProfile({
      bindings: { mode: "live" },
      launch: {
        ...baseProfile().launch,
        env: { PORT: "${port}", MODE: "${mode}" },
      },
    }),
    plan: { claims: [], gates: ["verify"], limits: [] },
  });
  const runsCreated = [];
  const start = async (...bindings) => {
    const run = assertEnvelope(
      await runCli(dir, [
        "--json",
        "up",
        "--plan",
        "plan.json",
        ...bindings.flatMap((binding) => ["--binding", binding]),
      ]),
      { ok: true, code: 0 },
    ).run;
    runsCreated.push(run);
    return run;
  };
  try {
    const gateRun = await start();
    const gate = assertEnvelope(
      await runCli(dir, [
        "--json",
        "exec",
        "--run",
        gateRun,
        "--",
        process.execPath,
        "-e",
        "console.log('gate ok')",
      ]),
      { ok: true, code: 0 },
    );
    const read = assertEnvelope(
      await runCli(dir, [
        "--json",
        "--run",
        gateRun,
        "api",
        "GET",
        "/health",
        "--expect",
        "401",
      ]),
      { ok: true, code: 0 },
    );
    // An API step can read any binding; an exec step reads only the launch's.
    const extra = await start("extra=1");
    const cite = (run, step) =>
      writeJson(join(dir, "result.json"), {
        operator: "agent",
        claims: [],
        gates: [
          { name: "verify", outcome: "passed", run: gateRun, steps: [step] },
        ],
        limits: [],
      }).then(() =>
        runCli(dir, [
          "--json",
          "result",
          "--run",
          run,
          "--file",
          "result.json",
        ]),
      );
    assertEnvelope(await cite(extra, gate.step), { ok: true, code: 0 });
    assert.match(
      JSON.stringify(
        assertEnvelope(await cite(extra, read.step), { ok: false, code: 1 }),
      ),
      /whose step .* used binding extra with a different value/,
    );
    // The app that this exec gate could reach ran in another mode.
    const stub = await start("mode=stub");
    await writeJson(join(dir, "result.json"), {
      operator: "agent",
      claims: [],
      gates: [
        { name: "verify", outcome: "passed", run: gateRun, steps: [gate.step] },
      ],
      limits: [],
    });
    const refused = assertEnvelope(
      await runCli(dir, [
        "--json",
        "result",
        "--run",
        stub,
        "--file",
        "result.json",
      ]),
      { ok: false, code: 1 },
    );
    assert.match(
      JSON.stringify(refused),
      /whose step .* used binding mode with a different value/,
    );
  } finally {
    for (const run of runsCreated)
      await runCli(dir, ["--json", "down", "--run", run]);
    await removeRepo(dir);
  }
});

test("a run whose worktree was removed stays listed and can still be stopped", async () => {
  const dir = await makeRepo({ profile: baseProfile(), plan });
  const removedTree = `${dir}-removed`;
  const shared = {
    env: { XDG_STATE_HOME: join(tmpdir(), `${basename(dir)}-state`) },
  };
  let run;
  try {
    await git(dir, ["worktree", "add", "-q", "--detach", removedTree, "HEAD"]);
    const up = assertEnvelope(
      await runCli(
        removedTree,
        ["--json", "up", "--plan", "plan.json"],
        shared,
      ),
      { ok: true, code: 0 },
    );
    run = up.run;
    const web = up.data.web;
    await git(dir, ["worktree", "remove", "--force", removedTree]);
    const listed = assertEnvelope(await runCli(dir, ["--json", "status"]), {
      ok: true,
      code: 0,
    });
    const row = listed.data.runs.find((item) => item.id === run);
    assert.equal(
      row?.worktreeRemoved,
      true,
      "status marks the removed worktree",
    );
    assertEnvelope(await runCli(dir, ["--json", "status", "--run", run]), {
      ok: true,
      code: 0,
    });
    assertEnvelope(await runCli(dir, ["--json", "down", "--run", run]), {
      ok: true,
      code: 0,
    });
    const stopped = assertEnvelope(
      await runCli(dir, ["--json", "status", "--run", run]),
      { ok: true, code: 0 },
    );
    assert.equal(stopped.data.state, "stopped");
    await assert.rejects(fetch(`${web}/health`), "the owned app is stopped");
    assert.equal(
      existsSync(removedTree),
      false,
      "down recreates no worktree files",
    );
  } finally {
    if (run) await runCli(dir, ["--json", "down", "--run", run]);
    await rm(removedTree, { recursive: true, force: true });
    await removeRepo(dir);
  }
});
