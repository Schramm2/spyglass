import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { profileSchema, planSchema, resultSchema } from "./schema.js";
const root = fileURLToPath(new URL("../schemas/", import.meta.url));
mkdirSync(root, { recursive: true });
for (const [name, schema] of Object.entries({
  profile: profileSchema,
  plan: planSchema,
  result: resultSchema,
}))
  writeFileSync(
    `${root}${name}.schema.json`,
    JSON.stringify(
      {
        $id: `https://github.com/Schramm2/spyglass/schemas/v1/${name}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + "\n",
  );
