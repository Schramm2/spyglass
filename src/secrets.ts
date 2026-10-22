import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Fault } from "./errors.js";
const isReference = (s: string) => /^(env:|file:|dotenv:|op:\/\/)/.test(s);
export class Secrets {
  private values = new Set<string>();
  private repo: string;
  constructor(repo: string) {
    this.repo = repo;
  }
  register(value: string): string {
    if (value) this.values.add(value);
    return value;
  }
  all(): string[] {
    return [...this.values];
  }
  resolve(ref: string): string {
    let value: string | undefined;
    try {
      if (ref.startsWith("env:")) value = process.env[ref.slice(4)];
      else if (ref.startsWith("file:"))
        value = readFileSync(resolve(this.repo, ref.slice(5)), "utf8").trim();
      else if (ref.startsWith("dotenv:")) {
        const [file, key] = ref.slice(7).split("#");
        if (!file || !key) throw Error("Expected dotenv:path#KEY");
        const row = readFileSync(resolve(this.repo, file), "utf8")
          .split(/\r?\n/)
          .find((l) => l.replace(/^export\s+/, "").startsWith(`${key}=`));
        value = row
          ?.replace(/^export\s+/, "")
          .slice(key.length + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
      } else if (ref.startsWith("op://")) {
        const r = spawnSync("op", ["read", "-n", ref], {
          encoding: "utf8",
          timeout: 15000,
        });
        if (r.status === 0) value = r.stdout;
      } else
        throw new Error(
          "Use env:NAME, file:path, dotenv:path#KEY or op://vault/item/field",
        );
    } catch {
      throw new Fault(
        "SECRET_UNAVAILABLE",
        `Cannot read secret reference ${ref}.`,
        "Check the reference source without printing its value.",
        3,
      );
    }
    if (!value)
      throw new Fault(
        "SECRET_UNAVAILABLE",
        `Secret reference ${ref} is empty or unavailable.`,
        "Provide the referenced secret and retry.",
        3,
      );
    return this.register(value);
  }
  collect(value: unknown, strict = false): void {
    if (typeof value === "string" && isReference(value)) {
      try {
        this.resolve(value);
      } catch (e) {
        if (strict) throw e;
      }
    } else if (Array.isArray(value))
      value.forEach((v) => this.collect(v, strict));
    else if (value && typeof value === "object")
      Object.values(value).forEach((v) => this.collect(v, strict));
  }
  text(s: string): string {
    for (const v of [...this.values].sort((a, b) => b.length - a.length)) {
      s = s.split(v).join("[REDACTED]");
      s = s.split(encodeURIComponent(v)).join("[REDACTED]");
    }
    return s
      .replace(/(Bearer\s+)[^\s"\\]+/gi, "$1[REDACTED]")
      .replace(
        /((?:password|authorization|set-cookie|cookie|access_token|refresh_token)\s*[=:]\s*)[^\r\n]+/gi,
        "$1[REDACTED]",
      );
  }
  clean<T>(value: T): T {
    const visit = (v: unknown, key = ""): unknown => {
      if (
        /^(password|authorization|cookie|cookies|set-cookie|access_token|refresh_token)$/i.test(
          key,
        )
      )
        return "[REDACTED]";
      if (typeof v === "string") return isReference(v) ? v : this.text(v);
      if (Array.isArray(v)) return v.map((x) => visit(x));
      if (v && typeof v === "object")
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, visit(x, k)]),
        );
      return v;
    };
    return visit(value) as T;
  }
  environment(
    base: NodeJS.ProcessEnv,
    env: Record<string, string> = {},
  ): NodeJS.ProcessEnv {
    return {
      ...base,
      ...Object.fromEntries(
        Object.entries(env).map(([k, v]) => [
          k,
          isReference(v) ? this.resolve(v) : v,
        ]),
      ),
    };
  }
}
