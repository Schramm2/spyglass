import { z } from "zod";
import { Fault } from "./errors.js";
import { BROWSER_IDLE_TIMEOUT_MS } from "./state.js";
const strings = z.record(z.string(), z.string());
const command = z.array(z.string()).min(1);
const secretReference = z
  .string()
  .regex(
    /^(env:[A-Za-z_][A-Za-z0-9_]*|file:.+|dotenv:.+#.+|op:\/\/.+)$/,
    "Use a secret reference: env:NAME, file:path, dotenv:path#KEY or op://vault/item/field",
  );
export const checkSchema = z.strictObject({
  command,
  env: strings.optional(),
  timeoutMs: z.number().positive().max(86400000).optional(),
  result: z.enum(["exit", "json", "engine"]).default("exit"),
  artifacts: z.array(z.string()).default([]),
  cleanup: z.boolean().default(false),
});
export const profileSchema = z.strictObject({
  version: z.literal(1),
  app: z.string().min(1),
  evidence: z.string().default(".spyglass/runs/${run}"),
  launch: z.strictObject({
    mode: z.enum(["none", "owned", "external"]),
    command: command.optional(),
    env: strings.optional(),
    ready: z
      .strictObject({
        url: z.string().optional(),
        status: z.number().int().optional(),
        command: command.optional(),
        timeoutMs: z.number().positive().max(86400000).optional(),
      })
      .optional(),
    doctor: command.optional(),
  }),
  web: z.string().optional(),
  api: z.string().optional(),
  bindings: strings.default({}),
  checks: z.record(z.string(), checkSchema).default({}),
  seats: z
    .record(
      z.string(),
      z.strictObject({
        token: secretReference.optional(),
        login: z
          .strictObject({
            path: z.string(),
            ready: z
              .strictObject({
                selector: z
                  .string()
                  .min(1)
                  .regex(
                    /^(?!\s*-)(?!\s*\d+\s*$)[\s\S]+$/,
                    "Use an element selector, not a wait flag or duration.",
                  ),
              })
              .optional(),
            steps: z.array(
              z.union([
                z.strictObject({
                  fill: z.union([
                    z.strictObject({ label: z.string().min(1) }),
                    z.strictObject({
                      role: z.string().min(1),
                      name: z.string().min(1),
                    }),
                  ]),
                  value: z.string().optional(),
                  secret: secretReference.optional(),
                }),
                z.strictObject({
                  click: z.strictObject({ role: z.string(), name: z.string() }),
                }),
              ]),
            ),
            done: z.strictObject({ urlContains: z.string() }),
          })
          .optional(),
      }),
    )
    .default({}),
  db: z.strictObject({ connection: secretReference }).optional(),
  compose: z
    .strictObject({
      project: z.string(),
      files: z.array(z.string()).min(1),
      required: z.array(z.string()).default([]),
    })
    .optional(),
  browser: z
    .strictObject({
      allowedOrigins: z.array(z.string()).default([]),
      // A run browser left idle shuts down, so a run without down cannot
      // keep a browser forever. No value disables this.
      idleTimeoutMs: z
        .number()
        .int()
        .min(1_000)
        .max(24 * 60 * 60_000)
        .default(BROWSER_IDLE_TIMEOUT_MS),
    })
    .optional(),
  source: z
    .strictObject({ include: z.array(z.string()).default([]) })
    .optional(),
  imports: z.array(z.string()).default([]),
  skill: z.string().optional(),
  features: z.string().optional(),
  provenance: z
    .record(
      z.string(),
      z.strictObject({
        status: z.enum(["observed", "guessed"]),
        source: z.string(),
      }),
    )
    .optional(),
});
export const claimSchema = z.strictObject({
  id: z.string().min(1),
  behavior: z.string().min(1),
  entryPoint: z.string().min(1),
  precondition: z.string().min(1),
  expected: z.string().min(1),
  case: z.string().min(1),
  checks: z.array(z.string()).min(1),
  evidence: z.array(z.string()).min(1),
  kind: z.enum(["behavior", "visual", "side-effect"]).default("behavior"),
  required: z.boolean().default(true),
});
export const planSchema = z.strictObject({
  controls: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        claim: z.string().min(1),
        expectation: z.string().min(1),
        assertion: z.string().min(1).optional(),
        command: command.optional(),
        failure: z
          .strictObject({
            code: z.string().min(1),
            contains: z.string().min(1),
          })
          .optional(),
      }),
    )
    .default([]),
  claims: z.array(claimSchema),
  gates: z.array(z.string()).default([]),
  limits: z.array(z.string()).default([]),
});
const outcome = z.enum(["passed", "failed", "blocked", "not run"]);
export const resultSchema = z.strictObject({
  controls: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        failedRun: z.string().min(1).optional(),
        failedStep: z.string(),
        restoredStep: z.string(),
        observedFailure: z.string(),
        observedPass: z.string(),
      }),
    )
    .default([]),
  operator: z.enum(["agent", "human"]),
  claims: z.array(
    z.strictObject({
      id: z.string(),
      outcome,
      steps: z.array(z.string()),
      observed: z.string(),
      artifacts: z.array(z.string()).default([]),
      inspection: z
        .strictObject({
          viewport: z.string().min(1),
          expected: z.string().min(1),
          observed: z.string().min(1),
        })
        .optional(),
      inspections: z
        .array(
          z.strictObject({
            viewport: z.string().trim().min(1),
            expected: z.string().trim().min(1),
            observed: z.string().trim().min(1),
            artifact: z.string().min(1),
          }),
        )
        .optional(),
      independentRead: z.string().optional(),
      reason: z.string().optional(),
    }),
  ),
  gates: z
    .array(
      z.strictObject({ name: z.string(), outcome, steps: z.array(z.string()) }),
    )
    .default([]),
  limits: z.array(z.string()).default([]),
});
export type Profile = z.infer<typeof profileSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Result = z.infer<typeof resultSchema>;
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new Fault(
      "INVALID_PROFILE",
      `${label}: ${parsed.error.issues.map((i) => `${i.path.join(".") || label}: ${i.message}`).join("; ")}`,
      `Read spyglass ${label === "profile" ? "init" : "result"} --help and the version 1 schema example.`,
    );
  return parsed.data;
}
