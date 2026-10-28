import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { basename, relative, resolve } from "node:path";
import { Client } from "pg";
import type { QueryConfig, QueryResult } from "pg";
import { Fault } from "./errors.js";
import { beneath, hash, safePath } from "./files.js";
import { saveRun, steps, type Context } from "./state.js";

const MAX_API_BODY_BYTES = 5 * 1024 * 1024;
const MAX_API_PREVIEW_CHARS = 4000;
const MAX_PROCESS_LOG_BYTES = 8 * 1024 * 1024;
const MAX_DB_ROWS = 1000;
const MAX_DB_OUTPUT_BYTES = 1024 * 1024;
const MAX_DB_SQL_BYTES = 100_000;
const DB_STATEMENT_TIMEOUT_MS = 10000;
const API_POLL_TIMEOUT_MS = 15_000;
const API_POLL_INTERVAL_MS = 250;
const SECRET_REFERENCE = /^(?:env:|file:|dotenv:|op:\/\/)/;
const SENSITIVE_FIELD =
  /(?:pass(?:word)?|token|secret|api[_-]?key|authorization|cookie|credential)/i;
const ROLE_QUERY = `
  SELECT current_user AS name,
    r.rolsuper AS superuser,
    r.rolcreatedb AS "createDatabase",
    r.rolcreaterole AS "createRole",
    r.rolreplication AS replication,
    r.rolbypassrls AS "bypassRls",
    has_database_privilege(current_user, current_database(), 'CREATE') AS "databaseCreate",
    has_database_privilege(current_user, current_database(), 'TEMP') AS "temporaryObjects",
    EXISTS (
      SELECT 1 FROM pg_namespace n
      WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%'
        AND has_schema_privilege(current_user, n.oid, 'CREATE')
    ) AS "schemaCreate",
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%'
        AND c.relkind IN ('r', 'p', 'v', 'f')
        AND (has_table_privilege(current_user, c.oid, 'INSERT')
          OR has_table_privilege(current_user, c.oid, 'UPDATE')
          OR has_table_privilege(current_user, c.oid, 'DELETE')
          OR has_table_privilege(current_user, c.oid, 'TRUNCATE'))
    ) AS "tableWrite",
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%'
        AND c.relkind = 'S'
        AND (has_sequence_privilege(current_user, c.oid, 'USAGE')
          OR has_sequence_privilege(current_user, c.oid, 'UPDATE'))
    ) AS "sequenceWrite"
  FROM pg_roles r WHERE r.rolname = current_user`;

type JsonObject = Record<string, unknown>;
type ParsedBody = { value: unknown; text: string };

export async function surfaces(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  const command = args[0];
  if (command === "api") return api(ctx, args.slice(1));
  if (command === "db") return database(ctx, args.slice(1));
  if (command === "ps") return composePs(ctx, args.slice(1));
  if (command === "mark") return mark(ctx, args.slice(1));
  if (command === "logs") return logs(ctx, args.slice(1));
  throw new Fault(
    "UNSUPPORTED_SURFACE",
    `Unsupported verification surface: ${command ?? "(missing)"}.`,
    "Use api, db, ps, mark or logs.",
  );
}

async function api(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  if (args.length < 2)
    throw usage(
      "api",
      "spyglass api METHOD PATH [--seat NAME] [--data JSON|@FILE] [--expect STATUS] [--expect-json PATH=VALUE] [--expect-body-contains TEXT] [--wait-until PATH=VALUE [--fail-on PATH=VALUE] [--timeout-ms MS] [--interval-ms MS]]",
    );
  const method = args[0]!.toUpperCase();
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(method)) {
    throw new Fault(
      "INVALID_METHOD",
      `Unsupported API method: ${args[0]}.`,
      "Use GET, HEAD, POST, PUT, PATCH, DELETE or OPTIONS.",
    );
  }
  const apiBase = ctx.run.api ?? expand(ctx, ctx.run.profile.api ?? "");
  if (!apiBase)
    throw new Fault(
      "API_UNAVAILABLE",
      "The selected run has no API address.",
      "Set profile.api and start a new run.",
    );
  const base = validApiBase(apiBase);
  const target = apiTarget(base, args[1]!);
  if (target.origin !== base.origin) {
    throw new Fault(
      "API_ORIGIN_BLOCKED",
      `API request origin ${target.origin} differs from the run API origin ${base.origin}.`,
      "Use a path on the run API origin or add a supported API address to the profile.",
      1,
      { origin: target.origin, apiOrigin: base.origin },
    );
  }

  let seatName: string | undefined;
  let dataArg: string | undefined;
  let expectedStatus: number | undefined;
  const jsonChecks: JsonCheck[] = [];
  const bodyChecks: string[] = [];
  let waitUntil: JsonCheck | undefined;
  let failOn: JsonCheck | undefined;
  let timeoutMs = API_POLL_TIMEOUT_MS;
  let intervalMs = API_POLL_INTERVAL_MS;
  let pollTuning = false;
  for (let i = 2; i < args.length; i++) {
    const option = args[i]!;
    if (option === "--seat") {
      seatName = args[++i];
      if (!seatName || seatName.startsWith("--"))
        throw usage("api", "--seat requires a seat name.");
    } else if (option === "--data") {
      dataArg = args[++i];
      if (dataArg === undefined || dataArg.startsWith("--"))
        throw usage("api", "--data requires JSON or @FILE.");
    } else if (option === "--expect") {
      const raw = args[++i];
      if (
        !raw ||
        raw.startsWith("--") ||
        !/^\d{3}$/.test(raw) ||
        Number(raw) < 100 ||
        Number(raw) > 599
      ) {
        throw usage(
          "api",
          "--expect requires an HTTP status from 100 through 599.",
        );
      }
      expectedStatus = Number(raw);
    } else if (option === "--expect-json") {
      jsonChecks.push(parseJsonCheck("api", option, args[++i], true));
    } else if (option === "--expect-body-contains") {
      const text = args[++i];
      if (text === undefined || text === "")
        throw usage("api", "--expect-body-contains requires text.");
      bodyChecks.push(text);
    } else if (option === "--wait-until") {
      waitUntil = parseJsonCheck("api", option, args[++i], false);
    } else if (option === "--fail-on") {
      failOn = parseJsonCheck("api", option, args[++i], false);
    } else if (option === "--timeout-ms" || option === "--interval-ms") {
      const raw = args[++i];
      const value = Number(raw);
      const [low, high] =
        option === "--timeout-ms" ? [1, 120_000] : [50, 10_000];
      if (!raw || !/^\d+$/.test(raw) || value < low || value > high)
        throw usage(
          "api",
          `${option} requires an integer from ${low} through ${high}.`,
        );
      if (option === "--timeout-ms") timeoutMs = value;
      else intervalMs = value;
      pollTuning = true;
    } else {
      throw usage("api", `Unknown API option: ${option}.`);
    }
  }
  if (waitUntil && !["GET", "HEAD"].includes(method))
    throw usage(
      "api",
      "--wait-until repeats the request, so it needs GET or HEAD; a repeated write would repeat its side effect.",
    );
  if (pollTuning && !waitUntil)
    throw usage("api", "--timeout-ms and --interval-ms need --wait-until.");

  let requestValue: unknown;
  let requestBody: string | undefined;
  if (dataArg !== undefined) {
    const raw = dataArg.startsWith("@")
      ? readDataFile(ctx, dataArg.slice(1))
      : dataArg;
    try {
      requestValue = JSON.parse(raw);
      requestBody = JSON.stringify(requestValue);
    } catch {
      throw new Fault(
        "INVALID_API_JSON",
        "The API request body is not valid JSON.",
        "Correct --data or the JSON file. The request was not sent.",
      );
    }
  }

  let authorization: string | undefined;
  if (seatName) {
    const seat = ctx.run.profile.seats[seatName];
    if (!seat)
      throw new Fault(
        "UNKNOWN_SEAT",
        `Unknown seat ${seatName}.`,
        `Define profile.seats.${seatName} or choose a listed seat.`,
      );
    if (!seat.token)
      throw new Fault(
        "SEAT_TOKEN_MISSING",
        `Seat ${seatName} has no API token source.`,
        `Set profile.seats.${seatName}.token to a credential reference.`,
      );
    const token = SECRET_REFERENCE.test(seat.token)
      ? ctx.vault.resolve(seat.token)
      : ctx.vault.register(seat.token);
    authorization = `Bearer ${token}`;
  }

  const requestHeaders: Record<string, string> = {
    accept: "application/json, text/plain;q=0.9, */*;q=0.8",
  };
  if (requestBody !== undefined)
    requestHeaders["content-type"] = "application/json";
  if (authorization) requestHeaders.authorization = authorization;
  const requestRecord = {
    method,
    url: safeUrl(target),
    headers: requestHeaders,
    body: sanitizeValue(ctx, requestValue ?? null),
  };

  const attempt = async (): Promise<{
    response: Response;
    body: ParsedBody;
  }> => {
    let response: Response | undefined;
    let body: ParsedBody;
    try {
      response = await fetch(target, {
        method,
        headers: requestHeaders,
        body: method === "GET" || method === "HEAD" ? undefined : requestBody,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      body = await responseBody(response);
    } catch (error) {
      const message = redactUrls(
        ctx,
        error instanceof Error ? error.message : String(error),
      );
      const record = {
        request: requestRecord,
        response: response
          ? {
              status: response.status,
              statusText: response.statusText,
              redirectLocation: response.headers.get("location")
                ? safeLocation(target, response.headers.get("location")!)
                : undefined,
            }
          : null,
        error: message,
      };
      const artifact = ctx.artifact("api-response.json", record, "api");
      if (error instanceof Fault) {
        throw new Fault(error.code, error.message, error.next, error.exit, {
          method,
          url: safeUrl(target),
          ...(response ? { status: response.status } : {}),
          artifacts: [artifact],
          error: message,
        });
      }
      throw new Fault(
        "API_REQUEST_FAILED",
        `API request failed: ${message}.`,
        "Check the run API address and app logs, then retry.",
        3,
        { method, url: safeUrl(target), artifacts: [artifact], error: message },
      );
    }
    return { response, body };
  };

  // One request, or a bounded poll of a GET until --wait-until holds. A
  // --fail-on state ends the poll at once.
  const started = Date.now();
  let polls = 0;
  let outcome: "reached" | "timeout" | "failed" | undefined;
  let last = await attempt();
  polls++;
  if (waitUntil || failOn)
    for (;;) {
      const seen = last.body.value;
      if (failOn && jsonMatches(seen, failOn).ok) {
        outcome = "failed";
        break;
      }
      if (!waitUntil || jsonMatches(seen, waitUntil).ok) {
        outcome = waitUntil ? "reached" : undefined;
        break;
      }
      if (Date.now() + intervalMs >= started + timeoutMs) {
        outcome = "timeout";
        break;
      }
      await new Promise((done) => setTimeout(done, intervalMs));
      last = await attempt();
      polls++;
    }
  const elapsedMs = Date.now() - started;
  const { response, body } = last;
  const responseText = body.text;
  const location = response.headers.get("location") ?? undefined;
  const headers = Object.fromEntries(
    [...response.headers.entries()].map(([name, value]) => [
      name,
      name.toLowerCase() === "location" ? safeLocation(target, value) : value,
    ]),
  );
  const responseRecord = {
    status: response.status,
    statusText: response.statusText,
    headers,
    body: sanitizeValue(ctx, body.value),
    ...(location ? { redirectLocation: safeLocation(target, location) } : {}),
  };

  // Every expectation is a structured assertion of the step, in the shape
  // that check records.
  const assertions: Assertion[] = [];
  if (expectedStatus !== undefined)
    assertions.push({
      id: `status=${expectedStatus}`,
      ok: response.status === expectedStatus,
      detail: `HTTP ${response.status}`,
    });
  for (const check of jsonChecks) {
    const verdict = jsonMatches(body.value, check);
    assertions.push({
      id: `json ${check.id}`,
      ok: verdict.ok,
      detail: verdict.detail,
    });
  }
  for (const text of bodyChecks)
    assertions.push({
      id: `body-contains ${text}`,
      ok: responseText.includes(text),
      detail: responseText.includes(text) ? "found" : "not found",
    });
  if (waitUntil)
    assertions.push({
      id: `wait-until ${waitUntil.id}`,
      ok: outcome === "reached",
      detail:
        outcome === "reached"
          ? `reached after ${polls} poll${polls === 1 ? "" : "s"}`
          : outcome === "failed"
            ? `a fail-on state came first`
            : `not reached in ${elapsedMs} ms`,
    });
  if (failOn)
    assertions.push({
      id: `fail-on ${failOn.id}`,
      ok: outcome !== "failed",
      detail: outcome === "failed" ? "reached" : "not reached",
    });
  const polling =
    waitUntil || failOn
      ? {
          polls,
          elapsedMs,
          timeoutMs,
          intervalMs,
          waitUntil: waitUntil?.id,
          failOn: failOn?.id,
          outcome: outcome ?? "single",
        }
      : undefined;
  const record = {
    request: requestRecord,
    response: responseRecord,
    ...(assertions.length ? { assertions } : {}),
    ...(polling ? { polling } : {}),
  };
  const artifact = ctx.artifact("api-response.json", record, "api");
  const cleanValue = sanitizeValue(ctx, body.value);
  const preview = previewBody(cleanValue, redactUrls(ctx, responseText));
  const data: Record<string, unknown> = {
    method,
    url: safeUrl(target),
    status: response.status,
    body: preview,
    artifacts: [artifact],
    ...(location ? { redirectLocation: safeLocation(target, location) } : {}),
    ...(assertions.length ? { claims: assertions } : {}),
    ...(polling ? { polls, elapsedMs } : {}),
  };

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Fault(
      "API_EXPECTATION_FAILED",
      `API returned HTTP ${response.status}; expected ${expectedStatus}.`,
      "Inspect the saved request and response, then correct the API behavior or the expected status.",
      1,
      data,
    );
  }
  const failed = assertions.filter((item) => !item.ok);
  if (failed.length)
    throw new Fault(
      "API_EXPECTATION_FAILED",
      `API expectation failed: ${failed.map((item) => `${item.id} (${item.detail})`).join("; ")}${polling ? `; ${polls} poll${polls === 1 ? "" : "s"} in ${elapsedMs} ms` : ""}.`,
      "Inspect the saved final response and the assertions, then correct the API behavior or the expectation.",
      1,
      data,
    );
  return sanitizeValue(ctx, data) as Record<string, unknown>;
}

interface Assertion {
  id: string;
  ok: boolean;
  detail?: string;
}
interface JsonCheck {
  id: string;
  path: string[];
  expected: string;
  negate: boolean;
}
/** `PATH=VALUE`, or `PATH!=VALUE` when the check allows it. */
function parseJsonCheck(
  command: string,
  flag: string,
  raw: string | undefined,
  allowNegate: boolean,
): JsonCheck {
  const found = /^([^=!\s]+)(!=|=)([\s\S]*)$/.exec(raw ?? "");
  if (!found || (found[2] === "!=" && !allowNegate))
    throw usage(
      command,
      `${flag} requires PATH=VALUE${allowNegate ? " or PATH!=VALUE" : ""}, for example status=complete or items.length=3.`,
    );
  return {
    id: `${found[1]}${found[2]}${found[3]}`,
    path: found[1]!.split("."),
    expected: found[3]!,
    negate: found[2] === "!=",
  };
}
/** A value at a dotted path: object keys, array indexes and length. */
function valueAt(
  root: unknown,
  path: string[],
): { found: boolean; value?: unknown } {
  let value = root;
  for (const part of path) {
    if (Array.isArray(value)) {
      if (part === "length") value = value.length;
      else if (/^\d+$/.test(part) && Number(part) < value.length)
        value = value[Number(part)];
      else return { found: false };
    } else if (typeof value === "string" && part === "length")
      value = value.length;
    else if (value && typeof value === "object" && Object.hasOwn(value, part))
      value = (value as Record<string, unknown>)[part];
    else return { found: false };
  }
  return { found: true, value };
}
function sameValue(actual: unknown, expected: string): boolean {
  try {
    if (isDeepStrictEqual(actual, JSON.parse(expected))) return true;
  } catch {
    /* Not a JSON literal: compare as text. */
  }
  return typeof actual !== "object" && String(actual) === expected;
}
/** A path that is not in the data fails both `=` and `!=`. */
function jsonMatches(
  root: unknown,
  check: JsonCheck,
): { ok: boolean; detail: string } {
  const at = valueAt(root, check.path);
  if (!at.found) return { ok: false, detail: "no value at the path" };
  const same = sameValue(at.value, check.expected);
  const shown = JSON.stringify(at.value);
  return {
    ok: check.negate ? !same : same,
    detail: `observed ${shown && shown.length > 80 ? shown.slice(0, 79) + "…" : shown}`,
  };
}

function safeUrl(url: URL): string {
  const clean = new URL(url.href);
  for (const key of [...clean.searchParams.keys()]) {
    if (SENSITIVE_FIELD.test(key)) clean.searchParams.set(key, "[REDACTED]");
  }
  return clean.href;
}

function safeLocation(base: URL, value: string): string {
  try {
    return safeUrl(new URL(value, base));
  } catch {
    return "[REDACTED]";
  }
}

function redactUrls(ctx: Context, value: string): string {
  return ctx.vault.text(value).replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
    try {
      return safeUrl(new URL(match));
    } catch {
      return match;
    }
  });
}

function sanitizeValue(ctx: Context, value: unknown): unknown {
  const clean = ctx.vault.clean(value);
  const visit = (item: unknown, key = ""): unknown => {
    if (SENSITIVE_FIELD.test(key)) return "[REDACTED]";
    if (typeof item === "string") return redactUrls(ctx, item);
    if (Array.isArray(item)) return item.map((entry) => visit(entry));
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([name, entry]) => [name, visit(entry, name)]),
      );
    return item;
  };
  return visit(clean);
}

function validApiBase(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Fault(
      "INVALID_API_ADDRESS",
      `Invalid API address: ${value}.`,
      "Set profile.api to an http or https address.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Fault(
      "INVALID_API_ADDRESS",
      "The API address must use HTTP or HTTPS and cannot contain user information or a fragment.",
      "Set profile.api to the run API origin and path.",
    );
  }
  return url;
}

function apiTarget(base: URL, path: string): URL {
  let target: URL;
  try {
    if (/^https?:\/\//i.test(path)) target = new URL(path);
    else {
      const normalizedBase = base.href.endsWith("/")
        ? base.href
        : `${base.href}/`;
      target = new URL(path.replace(/^\/+/, ""), normalizedBase);
    }
  } catch {
    throw new Fault(
      "INVALID_API_PATH",
      `Invalid API path: ${path}.`,
      "Use a relative API path or a URL on the run API origin.",
    );
  }
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.hash
  ) {
    throw new Fault(
      "INVALID_API_PATH",
      "API requests must use HTTP or HTTPS without user information or a fragment.",
      "Use a relative path on the run API origin.",
    );
  }
  return target;
}

function readDataFile(ctx: Context, file: string): string {
  if (!file) throw usage("api", "--data @FILE requires a file path.");
  const path = resolve(ctx.run.repo, file);
  if (!beneath(ctx.run.repo, path))
    throw new Fault(
      "UNSAFE_API_BODY",
      `API body file is outside the repository: ${file}.`,
      "Use a request file inside the repository.",
    );
  safePath(ctx.run.repo, path);
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Fault(
      "API_BODY_UNAVAILABLE",
      `Cannot read API body file ${file}: ${ctx.vault.text(error instanceof Error ? error.message : String(error))}.`,
      "Check the path and read permission, then retry.",
    );
  }
}

async function responseBody(response: Response): Promise<ParsedBody> {
  if (!response.body) return { value: null, text: "" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_API_BODY_BYTES) {
        await reader.cancel();
        throw new Fault(
          "API_RESPONSE_TOO_LARGE",
          `API response exceeded ${MAX_API_BODY_BYTES} bytes.`,
          "Use a narrower endpoint or a bounded response.",
          1,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = new TextDecoder().decode(
    Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  );
  if (!text) return { value: null, text };
  try {
    return { value: JSON.parse(text) as unknown, text };
  } catch {
    return { value: text, text };
  }
}

function previewBody(value: unknown, originalText: string): unknown {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized.length <= MAX_API_PREVIEW_CHARS) return value;
  return {
    truncated: true,
    preview: serialized.slice(0, MAX_API_PREVIEW_CHARS),
    bytes: Buffer.byteLength(originalText),
  };
}

async function database(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  const sql = args[0];
  if (!sql || sql.startsWith("--"))
    throw usage(
      "db",
      'spyglass db "<read-only SQL>" [--expect-rows N | --expect-empty] [--expect-col COLUMN=VALUE]',
    );
  if (Buffer.byteLength(sql) > MAX_DB_SQL_BYTES)
    throw new Fault(
      "DATABASE_QUERY_TOO_LARGE",
      `Database query exceeded ${MAX_DB_SQL_BYTES} bytes.`,
      "Use a shorter query and keep SQL output bounded.",
      2,
    );
  let expectedRows: number | undefined;
  let expectEmpty = false;
  const columnChecks: JsonCheck[] = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--expect-rows") {
      const raw = args[++i];
      if (!raw || raw.startsWith("--") || !/^\d+$/.test(raw))
        throw usage("db", "--expect-rows requires a non-negative integer.");
      expectedRows = Number(raw);
    } else if (args[i] === "--expect-empty") {
      expectEmpty = true;
      expectedRows = 0;
    } else if (args[i] === "--expect-col") {
      columnChecks.push(parseJsonCheck("db", "--expect-col", args[++i], true));
    } else {
      throw usage("db", `Unknown database option: ${args[i]}.`);
    }
  }
  if (expectEmpty && args.includes("--expect-rows"))
    throw usage("db", "--expect-empty and --expect-rows exclude each other.");
  const connectionString = databaseConnection(ctx);
  if (
    !/^(?:select|with|values|table|show|explain)\b/i.test(
      stripLeadingSqlComments(sql),
    )
  ) {
    throw new Fault(
      "DATABASE_READ_ONLY",
      "Spyglass accepts read-only SQL only.",
      "Use SELECT, WITH, VALUES, TABLE, SHOW or EXPLAIN. The query was not sent.",
      1,
    );
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
    query_timeout: DB_STATEMENT_TIMEOUT_MS + 2000,
  });
  let connected = false;
  let inTransaction = false;
  let result: QueryResult<Record<string, unknown>> | undefined;
  let role: Record<string, unknown> | undefined;
  let failure: unknown;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN READ ONLY");
    inTransaction = true;
    await client.query(
      `SET LOCAL statement_timeout = '${DB_STATEMENT_TIMEOUT_MS}ms'`,
    );
    await client.query(`SET LOCAL lock_timeout = '5000ms'`);
    // The role does not change between calls of one run: reuse what doctor or
    // an earlier call read. doctor reads it again.
    const connectionKey = hash(connectionString);
    role =
      ctx.run.databaseRole?.connection === connectionKey
        ? ctx.run.databaseRole.role
        : undefined;
    if (!role) {
      role = await inspectDatabaseRole(client);
      ctx.run.databaseRole = { connection: connectionKey, role };
    }
    if (/^(?:select|with|values|table)\b/i.test(stripLeadingSqlComments(sql))) {
      const declare = extendedQuery(
        `DECLARE spyglass_result NO SCROLL CURSOR FOR ${sql}`,
      );
      await client.query(declare);
      result = (await client.query(
        extendedQuery(`FETCH FORWARD ${MAX_DB_ROWS + 1} FROM spyglass_result`),
      )) as QueryResult<Record<string, unknown>>;
      await client.query(extendedQuery("CLOSE spyglass_result"));
    } else {
      result = (await client.query(extendedQuery(sql))) as QueryResult<
        Record<string, unknown>
      >;
    }
    await client.query("COMMIT");
    inTransaction = false;
  } catch (error) {
    failure = error;
    if (connected && inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* The connection may already be closed. */
      }
      inTransaction = false;
    }
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch (error) {
        if (!failure) failure = error;
      }
    }
  }

  const fetchedRows = result?.rows ?? [];
  const rowCount = result?.rowCount ?? fetchedRows.length;
  const bounded = boundedRows(ctx, fetchedRows.slice(0, MAX_DB_ROWS));
  const rows = [...bounded.rows];
  let outputBytes = bounded.bytes;
  const rowLimitExceeded = fetchedRows.length > MAX_DB_ROWS;
  let outputLimitExceeded = bounded.truncated;
  const makeData = (): JsonObject =>
    sanitizeValue(ctx, {
      sql,
      rows,
      rowCount,
      role,
      rowLimit: MAX_DB_ROWS,
      outputLimitBytes: MAX_DB_OUTPUT_BYTES,
      outputBytes,
      ...(rowLimitExceeded || outputLimitExceeded ? { truncated: true } : {}),
      ...(result?.command
        ? { command: queryCommand(sql) ?? result.command }
        : {}),
      ...(failure ? { error: ctx.vault.text(errorText(failure)) } : {}),
    }) as JsonObject;
  let data = makeData();
  while (
    Buffer.byteLength(`${JSON.stringify(data, null, 2)}\n`) >
      MAX_DB_OUTPUT_BYTES &&
    rows.length
  ) {
    rows.pop();
    outputBytes = Buffer.byteLength(JSON.stringify(rows));
    outputLimitExceeded = true;
    data = makeData();
  }
  const assertions: Assertion[] = [];
  if (expectedRows !== undefined)
    assertions.push({
      id: expectEmpty ? "empty" : `rows=${expectedRows}`,
      ok: rowCount === expectedRows,
      detail: `${rowCount} row${rowCount === 1 ? "" : "s"}`,
    });
  for (const check of columnChecks) {
    const verdict = jsonMatches(rows[0], check);
    assertions.push({
      id: `col ${check.id}`,
      ok: verdict.ok,
      detail: rows.length ? verdict.detail : "no row",
    });
  }
  const shown: JsonObject = assertions.length
    ? { ...data, claims: assertions }
    : data;
  const artifact = ctx.artifact(
    "database-result.json",
    assertions.length ? { ...data, assertions } : data,
    "database",
  );
  if (failure) {
    const message = ctx.vault.text(errorText(failure));
    throw new Fault(
      "DATABASE_QUERY_FAILED",
      `Database query failed: ${message}.`,
      "Check the query and database role, then retry.",
      1,
      { ...shown, artifacts: [artifact] },
    );
  }
  if (rowLimitExceeded) {
    throw new Fault(
      "DATABASE_ROW_LIMIT",
      `Database returned more than ${MAX_DB_ROWS} rows.`,
      "Narrow the query or add a limit. Spyglass retained only the first bounded rows.",
      1,
      { ...shown, artifacts: [artifact] },
    );
  }
  if (outputLimitExceeded) {
    throw new Fault(
      "DATABASE_OUTPUT_LIMIT",
      `Database output exceeded ${MAX_DB_OUTPUT_BYTES} bytes.`,
      "Select fewer or smaller columns and retry. Spyglass retained no unbounded result.",
      1,
      { ...shown, artifacts: [artifact] },
    );
  }
  if (expectedRows !== undefined && rowCount !== expectedRows) {
    throw new Fault(
      "DATABASE_ROW_COUNT",
      `Database returned ${rowCount} rows; expected ${expectedRows}.`,
      "Inspect the saved query result and correct the query or expected row count.",
      1,
      { ...shown, artifacts: [artifact] },
    );
  }
  const wrong = assertions.filter(
    (item) => item.id.startsWith("col ") && !item.ok,
  );
  if (wrong.length)
    throw new Fault(
      "DATABASE_EXPECTATION_FAILED",
      `Database column expectation failed: ${wrong.map((item) => `${item.id} (${item.detail})`).join("; ")}.`,
      "Inspect the saved query result and correct the query or the expected value.",
      1,
      { ...shown, artifacts: [artifact] },
    );
  return { ...shown, artifacts: [artifact] };
}

function databaseConnection(ctx: Context): string {
  const connectionSource = ctx.run.profile.db?.connection;
  if (!connectionSource)
    throw new Fault(
      "DATABASE_UNAVAILABLE",
      "The selected run has no database connection source.",
      "Set profile.db.connection to a supported secret reference.",
    );
  const connectionString = SECRET_REFERENCE.test(connectionSource)
    ? ctx.vault.resolve(connectionSource)
    : ctx.vault.register(connectionSource);
  registerConnectionSecrets(ctx, connectionString);
  return connectionString;
}

export async function readDatabaseRole(
  ctx: Context,
): Promise<Record<string, unknown>> {
  const connectionString = databaseConnection(ctx);
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
    query_timeout: DB_STATEMENT_TIMEOUT_MS + 2000,
  });
  let connected = false;
  let transaction = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN READ ONLY");
    transaction = true;
    await client.query(
      `SET LOCAL statement_timeout = '${DB_STATEMENT_TIMEOUT_MS}ms'`,
    );
    const role = await inspectDatabaseRole(client);
    await client.query("COMMIT");
    transaction = false;
    ctx.run.databaseRole = { connection: hash(connectionString), role };
    return sanitizeValue(ctx, role) as Record<string, unknown>;
  } catch (error) {
    if (connected && transaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* Keep the role-inspection failure. */
      }
    }
    const message = ctx.vault.text(errorText(error));
    throw new Fault(
      "DATABASE_ROLE_UNAVAILABLE",
      `Cannot inspect database role privileges: ${message}.`,
      "Check that the configured database user can read pg_roles and privilege metadata.",
      3,
    );
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch {
        /* The connection result is already determined. */
      }
    }
  }
}

async function inspectDatabaseRole(
  client: Client,
): Promise<Record<string, unknown>> {
  const result = (await client.query(extendedQuery(ROLE_QUERY))) as QueryResult<
    Record<string, unknown>
  >;
  const row = result.rows[0];
  if (!row)
    throw new Error("The current database role is not visible in pg_roles.");
  const elevated = [
    "superuser",
    "createDatabase",
    "createRole",
    "replication",
    "bypassRls",
  ].some((key) => row[key] === true);
  const writable =
    elevated ||
    ["databaseCreate", "schemaCreate", "tableWrite", "sequenceWrite"].some(
      (key) => row[key] === true,
    );
  return {
    name: row.name,
    superuser: row.superuser === true,
    createDatabase: row.createDatabase === true,
    createRole: row.createRole === true,
    replication: row.replication === true,
    bypassRls: row.bypassRls === true,
    databaseCreate: row.databaseCreate === true,
    temporaryObjects: row.temporaryObjects === true,
    schemaCreate: row.schemaCreate === true,
    tableWrite: row.tableWrite === true,
    sequenceWrite: row.sequenceWrite === true,
    elevated,
    writable,
    warning: writable
      ? "This role has write or elevated privileges. A read-only transaction does not prevent every side effect, including privileged functions."
      : "Role grants appear read-only for current database objects. Callable functions can still have side effects.",
  };
}

function extendedQuery(text: string): QueryConfig & { queryMode: "extended" } {
  return { text, values: [], queryMode: "extended" } as QueryConfig & {
    queryMode: "extended";
  };
}

function boundedRows(
  ctx: Context,
  rows: Record<string, unknown>[],
): { rows: Record<string, unknown>[]; bytes: number; truncated: boolean } {
  const kept: Record<string, unknown>[] = [];
  let bytes = 2;
  for (const row of rows) {
    const clean = sanitizeValue(ctx, row) as Record<string, unknown>;
    const encoded = JSON.stringify(clean);
    const size = Buffer.byteLength(encoded) + (kept.length ? 1 : 0);
    if (bytes + size > MAX_DB_OUTPUT_BYTES)
      return { rows: kept, bytes, truncated: true };
    kept.push(clean);
    bytes += size;
  }
  return { rows: kept, bytes, truncated: false };
}

function registerConnectionSecrets(
  ctx: Context,
  connectionString: string,
): void {
  ctx.vault.register(connectionString);
  try {
    const url = new URL(connectionString);
    if (url.password) {
      ctx.vault.register(url.password);
      try {
        ctx.vault.register(decodeURIComponent(url.password));
      } catch {
        /* Keep the encoded value registered. */
      }
    }
    const queryPassword = url.searchParams.get("password");
    if (queryPassword) ctx.vault.register(queryPassword);
  } catch {
    const match = connectionString.match(/(?:^|\s)password\s*=\s*([^\s]+)/i);
    if (match?.[1]) ctx.vault.register(match[1].replace(/^['"]|['"]$/g, ""));
  }
}

function stripLeadingSqlComments(sql: string): string {
  let value = sql.trim();
  while (value.startsWith("--") || value.startsWith("/*")) {
    if (value.startsWith("--")) {
      const end = value.indexOf("\n");
      value = end === -1 ? "" : value.slice(end + 1).trimStart();
    } else {
      const end = value.indexOf("*/", 2);
      if (end === -1) return "";
      value = value.slice(end + 2).trimStart();
    }
  }
  return value;
}

function queryCommand(sql: string): string | undefined {
  return stripLeadingSqlComments(sql)
    .match(/^([A-Za-z]+)/)?.[1]
    ?.toUpperCase();
}

function mark(ctx: Context, args: string[]): Record<string, unknown> {
  if (args.length !== 1) throw usage("mark", "spyglass mark LABEL");
  const label = args[0]!;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(label))
    throw new Fault(
      "INVALID_MARK",
      `Invalid mark label: ${label}.`,
      "Use 1 to 64 letters, digits, dots, underscores or hyphens.",
    );
  ctx.run.marks ??= {};
  const markedAt = new Date().toISOString();
  ctx.run.marks[label] = markedAt;
  saveRun(ctx.run);
  return { label, markedAt };
}

async function composePs(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  let wait = false;
  let timeoutMs = 30_000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--wait") wait = true;
    else if (args[i] === "--timeout-ms") {
      const raw = args[++i];
      timeoutMs = Number(raw);
      if (!raw || !/^\d+$/.test(raw) || timeoutMs < 1 || timeoutMs > 600_000)
        throw usage("ps", "--timeout-ms requires an integer from 1 to 600000.");
    } else throw usage("ps", "spyglass ps [--wait [--timeout-ms MS]]");
  }
  if (!wait && args.length) throw usage("ps", "--timeout-ms needs --wait.");
  const scope = composeScope(ctx);
  const command = [...scope.command, "ps", "--all", "--format", "json"];
  const started = Date.now();
  let polls = 0;
  let containers: JsonObject[] = [];
  let missing: string[] = [];
  for (;;) {
    polls++;
    const result = await ctx.execute(command, { timeoutMs: 20000 });
    if (result.exitCode !== 0)
      throw composeFault(
        ctx,
        "COMPOSE_PS_FAILED",
        "Docker Compose could not inspect the run project.",
        result.exitCode,
        result.stdout,
        result.stderr,
      );
    let rows: JsonObject[];
    try {
      rows = parseComposeJson(result.stdout);
    } catch (error) {
      throw new Fault(
        "COMPOSE_OUTPUT_INVALID",
        `Docker Compose returned invalid JSON: ${ctx.vault.text(errorText(error))}.`,
        "Check the installed Docker Compose version and run spyglass doctor.",
      );
    }
    containers = rows
      .filter((row) => !row.project || row.project === scope.project)
      .map((row) => normalizeContainer(row));
    missing = scope.required.filter(
      (service) =>
        !containers.some(
          (container) =>
            container.service === service && containerReady(container),
        ),
    );
    if (!missing.length || !wait || Date.now() + 500 >= started + timeoutMs)
      break;
    await new Promise((done) => setTimeout(done, 500));
  }
  const data = {
    project: scope.project,
    containers,
    required: scope.required,
    missing,
    ...(wait ? { polls, elapsedMs: Date.now() - started } : {}),
  };
  const artifact = ctx.artifact("compose-ps.json", data, "container");
  if (missing.length) {
    throw new Fault(
      "REQUIRED_CONTAINER_STOPPED",
      `Required container service(s) are not running and healthy: ${missing.join(", ")}.`,
      "Start the required service through its owner, then run spyglass ps again.",
      1,
      { ...data, artifacts: [artifact] },
    );
  }
  return { ...data, artifacts: [artifact] };
}

async function logs(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  const form =
    "spyglass logs [SERVICE] (--since MARK | --since-step STEP_ID | --since-last) [--grep PATTERN] [--expect-text TEXT] [--forbid-text TEXT]";
  let service: string | undefined;
  let since: string | undefined;
  let sinceStep: string | undefined;
  let sinceLast = false;
  let grepText: string | undefined;
  const expectText: string[] = [];
  const forbidText: string[] = [];
  const value = (i: number, flag: string): string => {
    const next = args[i];
    if (next === undefined || next === "" || next.startsWith("--"))
      throw usage("logs", `${flag} requires a value.`);
    return next;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--since") since = value(++i, "--since");
    else if (arg === "--since-step") sinceStep = value(++i, "--since-step");
    else if (arg === "--since-last") sinceLast = true;
    else if (arg === "--grep") grepText = value(++i, "--grep");
    else if (arg === "--expect-text")
      expectText.push(value(++i, "--expect-text"));
    else if (arg === "--forbid-text")
      forbidText.push(value(++i, "--forbid-text"));
    else if (arg.startsWith("--")) {
      throw usage("logs", `Unknown log option: ${arg}.`);
    } else if (service === undefined) {
      service = arg;
    } else {
      throw usage("logs", form);
    }
  }
  if ([since, sinceStep, sinceLast || undefined].filter(Boolean).length !== 1)
    throw usage("logs", `Give one log window: ${form}`);
  let pattern: RegExp | undefined;
  if (grepText !== undefined)
    try {
      pattern = new RegExp(grepText);
    } catch {
      throw usage("logs", "--grep requires a valid regular expression.");
    }
  let markedAt: string | undefined;
  let window: Record<string, unknown>;
  if (since) {
    markedAt = ctx.run.marks?.[since];
    if (!markedAt) {
      const known = Object.keys(ctx.run.marks ?? {});
      throw new Fault(
        "UNKNOWN_MARK",
        `Unknown log mark ${since}. Available marks: ${known.join(", ") || "none"}.`,
        "Run spyglass mark LABEL, then use that label with --since.",
      );
    }
    window = { mark: since };
  } else {
    const recorded = steps(ctx.run);
    const step = sinceStep
      ? recorded.find((item) => item.id === sinceStep)
      : recorded.at(-1);
    if (!step) {
      if (sinceStep)
        throw new Fault(
          "UNKNOWN_STEP",
          `Run ${ctx.run.id} has no step ${sinceStep}.`,
          `Use a step ID from spyglass status --run ${ctx.run.id} or the step log.`,
        );
      throw usage("logs", "--since-last needs an earlier step in this run.");
    }
    markedAt = step.startedAt;
    window = { sinceStep: step.id };
  }
  const filters = { pattern, grepText, expectText, forbidText };

  if (ctx.run.profile.compose) {
    if (service && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(service))
      throw new Fault(
        "INVALID_SERVICE",
        `Invalid compose service: ${service}.`,
        "Use a service name from the run compose file.",
      );
    const scope = composeScope(ctx);
    const command = [
      ...scope.command,
      "logs",
      "--no-color",
      "--timestamps",
      "--since",
      markedAt,
    ];
    if (service) command.push(service);
    const result = await ctx.execute(command, {
      timeoutMs: 30000,
      maxBytes: MAX_PROCESS_LOG_BYTES,
    });
    if (result.exitCode !== 0)
      throw composeFault(
        ctx,
        "COMPOSE_LOGS_FAILED",
        "Docker Compose could not read logs for the run project.",
        result.exitCode,
        result.stdout,
        result.stderr,
      );
    return finishLogs(
      ctx,
      ctx.vault.text(result.stdout),
      filters,
      "compose-logs.txt",
      "container-log",
      { project: scope.project, service: service ?? null, ...window, markedAt },
    );
  }

  if (service && service !== "app" && service !== ctx.run.profile.app) {
    throw new Fault(
      "UNKNOWN_PROCESS_SERVICE",
      `Unknown process log service ${service}.`,
      `Use app or ${ctx.run.profile.app}.`,
    );
  }
  const path = processLogPath(ctx);
  if (!path)
    throw new Fault(
      "PROCESS_LOGS_UNAVAILABLE",
      "This run has no captured process log file.",
      "Start the app through Spyglass or configure its owner to retain process output.",
    );
  safePath(ctx.run.evidence, path);
  const { content: bounded, truncated } = readBoundedLog(path);
  const timestamp = Date.parse(markedAt);
  const selected = bounded
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z)\s/);
      return match ? Date.parse(match[1]!) >= timestamp : false;
    })
    .join("\n");
  return finishLogs(
    ctx,
    ctx.vault.text(selected),
    filters,
    "process-logs.txt",
    "process-log",
    { service: service ?? "app", ...window, markedAt, truncated },
  );
}

/**
 * Filter the log lines, keep the log as evidence, then check the text
 * expectations on what remains. A failed expectation keeps the artifact.
 */
function finishLogs(
  ctx: Context,
  text: string,
  filters: {
    pattern?: RegExp;
    grepText?: string;
    expectText: string[];
    forbidText: string[];
  },
  name: string,
  kind: string,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const logs = filters.pattern
    ? text
        .split(/\r?\n/)
        .filter((line) => filters.pattern!.test(line))
        .join("\n")
    : text;
  const assertions: Assertion[] = [
    ...filters.expectText.map((item) => ({
      id: `expect-text ${item}`,
      ok: logs.includes(item),
      detail: logs.includes(item) ? "found" : "not found",
    })),
    ...filters.forbidText.map((item) => ({
      id: `forbid-text ${item}`,
      ok: !logs.includes(item),
      detail: logs.includes(item) ? "found" : "not found",
    })),
  ];
  const artifact = ctx.artifact(name, logs, kind);
  const data: Record<string, unknown> = {
    ...base,
    ...(filters.grepText !== undefined ? { grep: filters.grepText } : {}),
    logs,
    artifacts: [artifact],
    ...(assertions.length ? { claims: assertions } : {}),
  };
  const failed = assertions.filter((item) => !item.ok);
  if (failed.length)
    throw new Fault(
      "LOG_EXPECTATION_FAILED",
      `Log expectation failed: ${failed.map((item) => item.id).join("; ")}.`,
      "Inspect the retained log. Correct the app, or the text that you expect or forbid.",
      1,
      data,
    );
  return data;
}

function readBoundedLog(path: string): { content: string; truncated: boolean } {
  let descriptor: number;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
  } catch {
    throw new Fault(
      "UNSAFE_PROCESS_LOG",
      "The process log changed or cannot be opened safely.",
      "Inspect the run evidence directory and retry log collection.",
      3,
    );
  }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile())
      throw new Fault(
        "UNSAFE_PROCESS_LOG",
        "The process log is not a regular file.",
        "Inspect the run evidence directory and retry log collection.",
        3,
      );
    const truncated = stat.size > MAX_PROCESS_LOG_BYTES;
    const length = Math.min(stat.size, MAX_PROCESS_LOG_BYTES);
    const offset = Math.max(0, stat.size - length);
    const buffer = Buffer.alloc(length);
    let received = 0;
    while (received < length) {
      const count = readSync(
        descriptor,
        buffer,
        received,
        length - received,
        offset + received,
      );
      if (!count) break;
      received += count;
    }
    return {
      content: buffer.subarray(0, received).toString("utf8"),
      truncated,
    };
  } finally {
    closeSync(descriptor);
  }
}

function processLogPath(ctx: Context): string | undefined {
  const roots = [
    resolve(ctx.run.evidence, "spyglass/launch.log"),
    resolve(ctx.run.evidence, "spyglass/process.log"),
    resolve(ctx.run.evidence, "launch.log"),
  ];
  return roots.find((path) => existsSync(path));
}

interface ComposeScope {
  command: string[];
  project: string;
  required: string[];
}
function composeScope(ctx: Context): ComposeScope {
  const compose = ctx.run.profile.compose;
  if (!compose)
    throw new Fault(
      "CAPABILITY_UNAVAILABLE",
      "This run has no Docker Compose profile.",
      "Add profile.compose with a project name and compose files.",
    );
  const project = expand(ctx, compose.project);
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project))
    throw new Fault(
      "INVALID_COMPOSE_PROJECT",
      `Invalid Docker Compose project name: ${project}.`,
      "Use lowercase letters, digits, hyphens and underscores.",
    );
  if (!compose.files.length)
    throw new Fault(
      "INVALID_COMPOSE_FILES",
      "The Compose profile has no files.",
      "Set profile.compose.files to one or more repository compose files.",
    );
  const files: string[] = [];
  for (const source of compose.files) {
    const expanded = expand(ctx, source);
    const path = resolve(ctx.run.repo, expanded);
    if (!beneath(ctx.run.repo, path))
      throw new Fault(
        "UNSAFE_COMPOSE_FILE",
        `Compose file is outside the repository: ${source}.`,
        "Keep profile.compose.files inside the repository.",
      );
    safePath(ctx.run.repo, path);
    if (!existsSync(path))
      throw new Fault(
        "COMPOSE_FILE_MISSING",
        `Compose file does not exist: ${relative(ctx.run.repo, path)}.`,
        "Correct profile.compose.files and run spyglass init again.",
      );
    files.push(path);
  }
  const required = compose.required.map((name) => expand(ctx, name));
  const command = [
    "docker",
    "compose",
    "--project-name",
    project,
    ...files.flatMap((file) => ["--file", file]),
  ];
  return { command, project, required };
}

function expand(ctx: Context, value: string): string {
  const variables: Record<string, string> = {
    run: ctx.run.id,
    repo: ctx.run.repo,
    port: String(ctx.run.port),
    web: ctx.run.web ?? "",
    api: ctx.run.api ?? "",
    evidence: ctx.run.evidence,
    ...ctx.run.profile.bindings,
  };
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_match, name: string) => {
      const replacement = variables[name];
      if (replacement === undefined)
        throw new Fault(
          "MISSING_BINDING",
          `Missing profile binding ${name}.`,
          `Supply --binding ${name}=VALUE or remove the template from the profile.`,
        );
      return replacement;
    },
  );
}

function parseComposeJson(text: string): JsonObject[] {
  const output = text.trim();
  if (!output) return [];
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(isObject);
    if (isObject(parsed)) return [parsed];
  } catch {
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const parsed = JSON.parse(line) as unknown;
        if (!isObject(parsed))
          throw new Error("Container row is not an object.");
        return parsed;
      });
  }
  throw new Error("Container listing is not an object or array.");
}

function normalizeContainer(row: JsonObject): JsonObject {
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) if (row[key] !== undefined) return row[key];
    return undefined;
  };
  return {
    id: pick("ID", "Id", "id") ?? null,
    name: pick("Name", "Names", "name") ?? null,
    project: pick("Project", "project") ?? null,
    service: pick("Service", "service") ?? null,
    state: String(pick("State", "state") ?? "unknown").toLowerCase(),
    health: String(pick("Health", "health") ?? "").toLowerCase(),
    ports: pick("Publishers", "Ports", "ports") ?? [],
  };
}

// A container with a health check is ready only when it is healthy; one that
// is still starting, or is unhealthy, is not.
function containerReady(container: JsonObject): boolean {
  const state = String(container.state ?? "").toLowerCase();
  const health = String(container.health ?? "").toLowerCase();
  return state === "running" && (health === "" || health === "healthy");
}

function composeFault(
  ctx: Context,
  code: string,
  summary: string,
  exitCode: number,
  stdout: string,
  stderr: string,
): Fault {
  const output = ctx.vault
    .text([stdout, stderr].filter(Boolean).join("\n"))
    .slice(-MAX_API_PREVIEW_CHARS);
  return new Fault(
    code,
    `${summary}${output ? ` ${output}` : ""}`,
    "Check Docker Compose and the selected project files, then retry.",
    3,
    {
      exitCode,
      stdout: ctx.vault.text(stdout),
      stderr: ctx.vault.text(stderr),
    },
  );
}

function usage(command: string, detail: string): Fault {
  return new Fault(
    "INVALID_ARGUMENT",
    detail,
    `Run spyglass ${command} --help for valid arguments.`,
    2,
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
