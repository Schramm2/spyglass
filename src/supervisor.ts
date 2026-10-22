import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { writeJson } from "./files.js";
import { Secrets } from "./secrets.js";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input) as {
  command: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  log: string;
  appState: string;
  secrets: string[];
};
const vault = new Secrets(config.cwd);
config.secrets.forEach((v) => vault.register(v));
// Keep the process-group owner alive until down can verify and stop descendants.
setInterval(() => {}, 60000);
const child = spawn(config.command[0]!, config.command.slice(1), {
  cwd: config.cwd,
  env: config.env,
  stdio: ["ignore", "pipe", "pipe"],
});
const log = (s: string) =>
  appendFileSync(config.log, `${new Date().toISOString()} ${vault.text(s)}\n`, {
    mode: 0o600,
  });
for (const stream of [child.stdout, child.stderr]) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    pending += chunk;
    let n;
    while ((n = pending.indexOf("\n")) >= 0) {
      log(pending.slice(0, n));
      pending = pending.slice(n + 1);
    }
    if (pending.length > 1024 * 1024) {
      pending = "";
      log("[oversized log line omitted]");
    }
  });
  stream.on("end", () => {
    if (pending) log(pending);
  });
}
child.on("spawn", () =>
  writeJson(config.appState, {
    status: "running",
    pid: child.pid,
    startedAt: new Date().toISOString(),
  }),
);
child.on("error", (e) => {
  writeJson(config.appState, { status: "failed", exitCode: 1 });
  log(e.message);
  process.exitCode = 1;
});
child.on("close", (code) => {
  writeJson(config.appState, { status: "exited", exitCode: code ?? 1 });
  process.exitCode = code ?? 1;
});
process.on("SIGTERM", () => {
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
  }, 1000).unref();
});
