import { spawnSync, spawn } from "node:child_process";
import { appendFileSync, writeFileSync, openSync } from "node:fs";
const R = "/tmp/m11/C-direct-r2/repo", E = R + "/evidence", LOG = E + "/actions.jsonl";
const secrets = [process.env.DEMO_PASSWORD, process.env.DEMO_TOKEN].filter(Boolean);
const red = s => secrets.reduce((a, v) => a.split(v).join("[REDACTED]"), String(s));
let n = 0; const acts = [];
function rec(o) { o.seq = ++n; o.time = new Date().toISOString(); for (const k of Object.keys(o)) if (typeof o[k] === "string") o[k] = red(o[k]); appendFileSync(LOG, JSON.stringify(o) + "\n"); acts.push(o); return o; }
function sh(cmd, label) { const t0 = Date.now(); const r = spawnSync("bash", ["-c", cmd], { cwd: R, encoding: "utf8" }); return rec({ type: "command", label, command: cmd, exit: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - t0 }); }
async function http(path, label) { const t0 = Date.now(); try { const r = await fetch("http://127.0.0.1:47105" + path); return rec({ type: "http", label, request: "GET http://127.0.0.1:47105" + path, status: r.status, body: await r.text(), ms: Date.now() - t0 }); } catch (e) { return rec({ type: "http", label, request: "GET http://127.0.0.1:47105" + path, status: null, error: String(e), ms: Date.now() - t0 }); } }
const phase = process.argv[2];
if (phase === "main") {
  writeFileSync(LOG, "");
  sh("git rev-parse HEAD; git status --porcelain=v1 --untracked-files=all; git diff HEAD | sha256sum", "source-identity-start");
  await http("/health", "health-before-start (expected to fail: app not started)");
  const out = openSync(E + "/app.log", "w");
  const app = spawn("node", ["fixtures/demo-app/server.mjs"], { cwd: R, env: { ...process.env, PORT: "47105" }, stdio: ["ignore", out, out], detached: true });
  app.unref(); rec({ type: "process", label: "app-start", command: "PORT=47105 node fixtures/demo-app/server.mjs", pid: app.pid });
  writeFileSync(E + "/app.pid", String(app.pid));
  let h; for (let i = 0; i < 50; i++) { h = await http("/health", "health-ready-poll " + i); if (h.status === 200) break; await new Promise(r => setTimeout(r, 200)); }
  const health = await http("/health", "claim health-ready");
  const p1 = sh("node fixtures/demo-app/check.mjs pass", "claim demo-check-pass");
  const cf = sh("node fixtures/demo-app/check.mjs fail", "control deliberate failing attempt");
  const cp = sh("node fixtures/demo-app/check.mjs pass", "control restored passing attempt");
  writeFileSync(E + "/refs.json", JSON.stringify({ health: health.seq, pass: p1.seq, fail: cf.seq, restored: cp.seq }));
} else if (phase === "cleanup") {
  sh(`kill $(cat ${E}/app.pid); sleep 0.5; kill -0 $(cat ${E}/app.pid) 2>/dev/null && echo STILL-RUNNING || echo app-process-gone`, "stop app");
  await http("/health", "health-after-stop (expected to fail)");
  sh("agent-browser --session C-direct-r2 close; echo exit=$?", "close browser session (none was opened)");
  sh("git rev-parse HEAD; git status --porcelain=v1 --untracked-files=all; git diff HEAD | sha256sum", "source-identity-end");
}
