// usage: node step.mjs <id> <claim> <command...>  -- runs command in bash, logs redacted record to actions.jsonl
import { spawnSync } from "node:child_process"; import fs from "node:fs";
const [id, claim, ...rest] = process.argv.slice(2); const cmd = rest.join(" ");
const red = s => { for (const k of ["DEMO_PASSWORD","DEMO_TOKEN"]) if (process.env[k]) s = s.split(process.env[k]).join(`<${k}>`); return s; };
const start = new Date().toISOString();
const r = spawnSync("bash", ["-c", cmd], { encoding: "utf8", env: process.env });
const rec = { id, claim, start, end: new Date().toISOString(), command: cmd, exit: r.status, stdout: red(r.stdout||""), stderr: red(r.stderr||"") };
fs.appendFileSync(new URL("./actions.jsonl", import.meta.url), JSON.stringify(rec) + "\n");
console.log(JSON.stringify(rec, null, 1));
