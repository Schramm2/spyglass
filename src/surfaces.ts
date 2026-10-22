import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { basename, relative, resolve } from "node:path";
import { Client } from "pg";
import type { QueryConfig, QueryResult } from "pg";
import { Fault } from "./errors.js";
import { beneath, safePath } from "./files.js";
import { saveRun, type Context } from "./state.js";

const MAX_API_BODY_BYTES = 5 * 1024 * 1024;
const MAX_API_PREVIEW_CHARS = 4000;
const MAX_PROCESS_LOG_BYTES = 8 * 1024 * 1024;
const MAX_DB_ROWS = 1000;
const MAX_DB_OUTPUT_BYTES = 1024 * 1024;
const MAX_DB_SQL_BYTES = 100_000;
const DB_STATEMENT_TIMEOUT_MS = 10000;
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
      "spyglass api METHOD PATH [--seat NAME] [--data JSON|@FILE] [--expect STATUS]",
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
    } else {
      throw usage("api", `Unknown API option: ${option}.`);
    }
  }

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

  if (!response)
    throw new Fault(
      "API_REQUEST_FAILED",
      "The API did not return a response.",
      "Check the run API address and retry.",
      3,
    );
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
  const record = { request: requestRecord, response: responseRecord };
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
  return sanitizeValue(ctx, data) as Record<string, unknown>;
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
    throw usage("db", 'spyglass db "<read-only SQL>" [--expect-rows N]');
  if (Buffer.byteLength(sql) > MAX_DB_SQL_BYTES)
    throw new Fault(
      "DATABASE_QUERY_TOO_LARGE",
      `Database query exceeded ${MAX_DB_SQL_BYTES} bytes.`,
      "Use a shorter query and keep SQL output bounded.",
      2,
    );
  let expectedRows: number | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--expect-rows") {
      const raw = args[++i];
      if (!raw || raw.startsWith("--") || !/^\d+$/.test(raw))
        throw usage("db", "--expect-rows requires a non-negative integer.");
      expectedRows = Number(raw);
    } else {
      throw usage("db", `Unknown database option: ${args[i]}.`);
    }
  }
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
    role = await inspectDatabaseRole(client);
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
  const artifact = ctx.artifact("database-result.json", data, "database");
  if (failure) {
    const message = ctx.vault.text(errorText(failure));
    throw new Fault(
      "DATABASE_QUERY_FAILED",
      `Database query failed: ${message}.`,
      "Check the query and database role, then retry.",
      1,
      { ...data, artifacts: [artifact] },
    );
  }
  if (rowLimitExceeded) {
    throw new Fault(
      "DATABASE_ROW_LIMIT",
      `Database returned more than ${MAX_DB_ROWS} rows.`,
      "Narrow the query or add a limit. Spyglass retained only the first bounded rows.",
      1,
      { ...data, artifacts: [artifact] },
    );
  }
  if (outputLimitExceeded) {
    throw new Fault(
      "DATABASE_OUTPUT_LIMIT",
      `Database output exceeded ${MAX_DB_OUTPUT_BYTES} bytes.`,
      "Select fewer or smaller columns and retry. Spyglass retained no unbounded result.",
      1,
      { ...data, artifacts: [artifact] },
    );
  }
  if (expectedRows !== undefined && rowCount !== expectedRows) {
    throw new Fault(
      "DATABASE_ROW_COUNT",
      `Database returned ${rowCount} rows; expected ${expectedRows}.`,
      "Inspect the saved query result and correct the query or expected row count.",
      1,
      { ...data, artifacts: [artifact] },
    );
  }
  return { ...data, artifacts: [artifact] };
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
  const client = new Client({
    connectionString: databaseConnection(ctx),
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
  if (args.length) throw usage("ps", "spyglass ps");
  const scope = composeScope(ctx);
  const command = [...scope.command, "ps", "--all", "--format", "json"];
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
  const containers = rows
    .filter((row) => !row.project || row.project === scope.project)
    .map((row) => normalizeContainer(row));
  const missing = scope.required.filter(
    (service) =>
      !containers.some(
        (container) =>
          container.service === service && containerReady(container),
      ),
  );
  const data = {
    project: scope.project,
    containers,
    required: scope.required,
    missing,
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
  let service: string | undefined;
  let since: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--since") {
      since = args[++i];
      if (!since || since.startsWith("--"))
        throw usage("logs", "--since requires a mark label.");
    } else if (arg.startsWith("--")) {
      throw usage("logs", `Unknown log option: ${arg}.`);
    } else if (service === undefined) {
      service = arg;
    } else {
      throw usage("logs", "spyglass logs [SERVICE] --since MARK");
    }
  }
  if (!since) throw usage("logs", "spyglass logs [SERVICE] --since MARK");
  const markedAt = ctx.run.marks?.[since];
  if (!markedAt) {
    const known = Object.keys(ctx.run.marks ?? {});
    throw new Fault(
      "UNKNOWN_MARK",
      `Unknown log mark ${since}. Available marks: ${known.join(", ") || "none"}.`,
      "Run spyglass mark LABEL, then use that label with --since.",
    );
  }

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
    const content = ctx.vault.text(result.stdout);
    const artifact = ctx.artifact("compose-logs.txt", content, "container-log");
    return {
      project: scope.project,
      service: service ?? null,
      mark: since,
      markedAt,
      logs: content,
      artifacts: [artifact],
    };
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
  const clean = ctx.vault.text(selected);
  const artifact = ctx.artifact("process-logs.txt", clean, "process-log");
  return {
    service: service ?? "app",
    mark: since,
    markedAt,
    logs: clean,
    truncated,
    artifacts: [artifact],
  };
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

function containerReady(container: JsonObject): boolean {
  const state = String(container.state ?? "").toLowerCase();
  return state === "running";
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
