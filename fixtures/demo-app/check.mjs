import { writeFile } from "node:fs/promises";

const outcome = process.argv[2] ?? "pass";
const result =
  outcome === "pass"
    ? {
        ok: true,
        claims: [
          { id: "demo-check", ok: true, detail: "the demo check passed" },
        ],
        artifacts: ["check-output.json"],
        skips: [],
      }
    : {
        ok: false,
        claims: [
          { id: "demo-check", ok: false, detail: "the demo assertion failed" },
        ],
        artifacts: ["check-output.json"],
        skips: ["demo-required-case"],
      };
await writeFile("check-output.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
