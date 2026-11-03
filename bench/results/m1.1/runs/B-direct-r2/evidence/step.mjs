// usage: node step.mjs <id> <label> -- cmd args...   (runs via shell string in argv[4])
import { execSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
const [id, label, cmd] = process.argv.slice(2);
const secrets = [process.env.DEMO_PASSWORD, process.env.DEMO_TOKEN].filter(Boolean);
const red = s => secrets.reduce((a, v) => a.split(v).join("[REDACTED]"), String(s ?? ""));
const start = new Date().toISOString();
const r = spawnSync("bash", ["-c", cmd], { encoding: "utf8", env: process.env });
const rec = { id, label, start, end: new Date().toISOString(), command: red(cmd).replace(/\$DEMO_PASSWORD|\$DEMO_TOKEN/g, m => m), exit: r.status, stdout: red(r.stdout), stderr: red(r.stderr) };
appendFileSync(new URL("./actions.jsonl", import.meta.url), JSON.stringify(rec) + "\n");
console.log(JSON.stringify(rec, null, 1));
