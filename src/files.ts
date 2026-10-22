import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";
import { Fault } from "./errors.js";
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fault(
      "INVALID_JSON",
      `Cannot read valid JSON from ${file}.`,
      "Correct the file and retry.",
    );
  }
}
export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, file);
}
export function beneath(root: string, file: string): boolean {
  const rel = relative(resolve(root), resolve(file));
  return (
    rel === "" ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep))
  );
}
export function safePath(root: string, file: string): string {
  const out = resolve(root, file);
  if (!beneath(root, out))
    throw new Fault(
      "UNSAFE_PATH",
      `Path is outside the allowed root: ${file}.`,
      "Use a path inside the run evidence folder.",
    );
  let cursor = out;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (existsSync(cursor) && realpathSync(cursor) !== resolve(cursor))
    throw new Fault(
      "UNSAFE_PATH",
      "Symlink paths are not allowed for evidence.",
      "Choose a directory without symlink components.",
    );
  return out;
}
export function regular(file: string): void {
  const st = lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink())
    throw new Fault(
      "UNSAFE_PATH",
      `Not a regular artifact: ${file}.`,
      "Import an allowed regular file.",
    );
}
