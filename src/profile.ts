import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Fault } from "./errors.js";
import { hash, readJson, writeJson } from "./files.js";
import { profileSchema, validate } from "./schema.js";
import type { Profile } from "./schema.js";
export function repository(cwd = process.cwd()): string {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Fault(
      "NOT_REPOSITORY",
      "Spyglass requires a Git working tree.",
      "Run git init in the target project, then run spyglass init.",
    );
  return realpathSync(r.stdout.trim());
}
export function locateProfile(repo: string, explicit?: string): string {
  if (explicit) return resolve(process.cwd(), explicit);
  const paths = new Set<string>();
  let dir = realpathSync(process.cwd());
  while (dir.startsWith(repo)) {
    if (existsSync(join(dir, "spyglass.json")))
      paths.add(join(dir, "spyglass.json"));
    if (dir === repo) break;
    dir = dirname(dir);
  }
  for (const root of [
    ".agents/skills",
    "development/skills",
    ".cursor/skills",
  ]) {
    const base = join(repo, root);
    if (existsSync(base))
      for (const name of readdirSync(base)) {
        const p = join(base, name, "spyglass.json");
        if (existsSync(p)) paths.add(realpathSync(p));
      }
  }
  if (paths.size !== 1)
    throw new Fault(
      paths.size ? "AMBIGUOUS_PROFILE" : "NO_PROFILE",
      paths.size
        ? `Multiple profiles: ${[...paths].map((p) => relative(repo, p)).join(", ")}`
        : "No spyglass.json profile found.",
      paths.size
        ? "Use --profile <path>."
        : "Run spyglass init, or spyglass up --cmd <command> --ready <url>.",
    );
  return [...paths][0]!;
}
export function loadProfile(file: string): Profile {
  const p = validate(profileSchema, readJson(file), "profile");
  if (p.launch.mode === "owned" && (!p.launch.command || !p.launch.ready))
    throw new Fault(
      "INVALID_PROFILE",
      "profile.launch: owned mode requires command and ready.",
      'Example: {"mode":"owned","command":["npm","run","dev"],"ready":{"url":"http://127.0.0.1:3000"}}',
    );
  if (p.launch.mode === "external" && !p.launch.doctor && !p.launch.ready)
    throw new Fault(
      "INVALID_PROFILE",
      "profile.launch: external mode requires an owner doctor or readiness command.",
      "Set launch.doctor to the existing owner tool command.",
    );
  return p;
}
export function template<T>(value: T, vars: Record<string, string>): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string")
      return v.replace(/\$\{([A-Za-z_][\w]*)\}/g, (_, k: string) => {
        if (vars[k] === undefined)
          throw new Fault(
            "MISSING_BINDING",
            `Missing binding ${k}.`,
            `Supply --binding ${k}=VALUE.`,
          );
        return vars[k]!;
      });
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, walk(x)]),
      );
    return v;
  };
  return walk(value) as T;
}
export function init(repo: string, force = false): Record<string, unknown> {
  const target = join(repo, "spyglass.json");
  if (existsSync(target) && !force)
    throw new Fault(
      "PROFILE_EXISTS",
      "spyglass.json already exists.",
      "Review it; use spyglass init --force to replace it.",
    );
  const skills: string[] = [];
  for (const root of [
    ".agents/skills",
    "development/skills",
    ".cursor/skills",
  ]) {
    const dir = join(repo, root);
    if (existsSync(dir))
      for (const name of readdirSync(dir).filter((n) =>
        n.startsWith("verify-"),
      )) {
        const path = join(root, name, "SKILL.md");
        if (existsSync(join(repo, path))) skills.push(path);
      }
  }
  const discoveryPaths = [
    ...skills,
    ...skills.map((path) => join(dirname(path), "features/README.md")),
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "Makefile",
    "justfile",
    "Taskfile.yml",
    "Taskfile.yaml",
    "compose.yaml",
    "compose.yml",
    "docker-compose.yml",
    "docker-compose.yaml",
    "README.md",
  ].filter((path) => existsSync(join(repo, path)));
  const discovery = discoveryPaths.map((path) => ({
    path,
    sha256: hash(readFileSync(join(repo, path))),
    reviewRequired: true,
  }));
  const provenance: Record<
    string,
    { status: "observed" | "guessed"; source: string }
  > = { app: { status: "guessed", source: "repository directory name" } };
  provenance.version = {
    status: "observed",
    source: "Spyglass schema version 1",
  };
  provenance.evidence = {
    status: "guessed",
    source: "default ignored run evidence location",
  };
  provenance.launch = {
    status: "guessed",
    source: skills.length
      ? "existing owner skill requires review"
      : "no persistent process discovered",
  };
  provenance.checks = { status: "observed", source: "repository task runners" };
  const guidance = skills.map((path) => ({
    path,
    text: readFileSync(join(repo, path), "utf8").slice(0, 12000),
  }));
  const raw: Record<string, unknown> = {
    version: 1,
    app: basename(repo),
    evidence: ".spyglass/runs/${run}",
    launch: { mode: "none" },
    checks: {},
    provenance,
  };
  const checks: Record<string, unknown> = {};
  const pkg = existsSync(join(repo, "package.json"))
    ? (readJson(join(repo, "package.json")) as {
        scripts?: Record<string, string>;
      })
    : {};
  for (const name of ["verify", "test", "check", "lint", "typecheck"])
    if (pkg.scripts?.[name]) {
      checks[name] = { command: ["npm", "run", name], timeoutMs: 300000 };
      provenance[`checks.${name}`] = {
        status: "observed",
        source: `package.json scripts.${name}`,
      };
    }
  if (pkg.scripts?.dev && !skills.length) {
    const isNext = /\bnext dev\b/.test(pkg.scripts.dev);
    raw.launch = {
      mode: "owned",
      command: isNext
        ? [
            "npm",
            "run",
            "dev",
            "--",
            "--port",
            "${port}",
            "--hostname",
            "127.0.0.1",
          ]
        : ["npm", "run", "dev"],
      env: { PORT: "${port}" },
      ready: {
        url: "http://127.0.0.1:${port}",
        status: 200,
        timeoutMs: 120000,
      },
    };
    raw.web = "http://127.0.0.1:${port}";
    raw.api = raw.web;
    provenance.launch = {
      status: "observed",
      source: "package.json scripts.dev",
    };
    provenance.web = {
      status: "guessed",
      source: "port and readiness require an observed launch",
    };
    provenance.api = {
      status: "guessed",
      source: "HTTP base proposed from the web address; review before use",
    };
    provenance["launch.ready"] = {
      status: "guessed",
      source: "HTTP 200 readiness requires owner review",
    };
  }
  if (existsSync(join(repo, "Makefile"))) {
    const make = readFileSync(join(repo, "Makefile"), "utf8");
    for (const name of ["verify", "check", "test"])
      if (new RegExp(`^${name}:`, "m").test(make) && !checks[name]) {
        checks[name] = { command: ["make", name], timeoutMs: 300000 };
        provenance[`checks.${name}`] = {
          status: "observed",
          source: `Makefile ${name}`,
        };
      }
  }
  if (skills.length === 1) {
    raw.skill = skills[0];
    const map = join(dirname(skills[0]!), "features/README.md");
    if (existsSync(join(repo, map))) {
      raw.features = map;
      provenance.features = { status: "observed", source: map };
    }
    provenance.skill = { status: "observed", source: skills[0]! };
  }
  raw.checks = checks;
  if (!pkg.scripts?.dev && !Object.keys(checks).length)
    throw new Fault(
      "DISCOVERY_INCOMPLETE",
      `No usable launch or verification command found. Looked in package.json, Makefile, task-runner and Compose files, README.md and verification skill roots. ${skills.length ? `Read ${skills.join(", ")} to configure its owner commands.` : ""}`,
      "Add a profile with the repository owner command; readiness and evidence are required.",
    );
  const previous = existsSync(target) ? readJson(target) : null;
  validate(profileSchema, raw, "profile");
  const changedPaths: string[] = [];
  const compare = (a: unknown, b: unknown, path = "") => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        compare(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          path ? `${path}.${k}` : k,
        );
    } else changedPaths.push(path);
  };
  if (previous) compare(previous, raw);
  const difference = previous
    ? {
        changedPaths,
        previousHash: hash(JSON.stringify(previous)),
        proposedHash: hash(JSON.stringify(raw)),
      }
    : null;
  if (difference)
    process.stderr.write(
      `Profile replacement preview (changed fields): ${changedPaths.join(", ") || "none"}\n`,
    );
  writeJson(target, raw);
  return {
    profile: "spyglass.json",
    proposal: raw,
    difference,
    discovery,
    capabilities: {
      ui: {
        available: Boolean(raw.web),
        tool: "agent-browser",
        testedVersion: "0.38.2",
      },
      api: { available: Boolean(raw.api), tool: "Node fetch" },
      db: { available: false, tool: "node-postgres" },
      compose: { available: false, tool: "docker compose" },
      check: {
        available: Object.keys(checks).length > 0,
        names: Object.keys(checks),
      },
      exec: { available: true },
      skill: raw.skill ?? null,
      features: raw.features ?? null,
    },
    guidance: guidance.map((g) => ({ path: g.path, reviewRequired: true })),
    next: "Review guessed fields and the existing verification skill; add .spyglass/ to .gitignore, then run spyglass up.",
  };
}
