import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { connect as netConnect } from "node:net";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Fault } from "./errors.js";
import { processIdentity } from "./process.js";
import { BROWSER_IDLE_TIMEOUT_MS, runHome, saveRun } from "./state.js";
import type { Run } from "./state.js";

const HEADER_LIMIT = 16 * 1024;
const BODY_LIMIT = 10 * 1024 * 1024;
const RESPONSE_BODY_LIMIT = 50 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const START_TIMEOUT_MS = 10_000;
const EVENT_LIMIT = 128;
const HEALTH_PATH = "/__spyglass_proxy_health";

interface ProxyConfig {
  origins: string[];
  instance: string;
  nonce: string;
  ready: string;
  /** Absent in proxies started before idle shutdown existed. */
  idleTimeoutMs?: number;
}
interface BlockedEvent {
  sequence: number;
  origin: string;
  navigation: boolean;
  protocol: string;
}
interface ProxyState {
  pid: number;
  instance: string;
  nonce: string;
  sequence: number;
  blocked: BlockedEvent[];
}
interface ProxyMetadata {
  pid: number;
  identity: string;
  port: number;
  origins: string[];
  instance: string;
  sequence: number;
}

function proxyDirectory(run: Run): string {
  return runHome(run);
}
function configPath(run: Run): string {
  return join(proxyDirectory(run), "browser-proxy.json");
}
function readyPath(run: Run): string {
  return join(proxyDirectory(run), "browser-proxy-ready.json");
}
function ordered(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function readConfig(file: string): ProxyConfig {
  const value = JSON.parse(readFileSync(file, "utf8")) as Partial<ProxyConfig>;
  if (
    !Array.isArray(value.origins) ||
    !value.origins.every((origin) => typeof origin === "string") ||
    typeof value.instance !== "string" ||
    typeof value.nonce !== "string" ||
    typeof value.ready !== "string" ||
    (value.idleTimeoutMs !== undefined &&
      !(Number.isInteger(value.idleTimeoutMs) && value.idleTimeoutMs > 0))
  ) {
    throw new Error("invalid browser proxy configuration");
  }
  return value as ProxyConfig;
}
function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
function originFor(url: URL): string | undefined {
  if (url.username || url.password) return undefined;
  if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    const mapped = new URL(url.href);
    mapped.protocol = url.protocol === "ws:" ? "http:" : "https:";
    return mapped.origin;
  }
  return undefined;
}
function socketHost(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}
function loopback(address: string | undefined): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}
function sendError(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(message),
    connection: "close",
  });
  response.end(message);
}
function headerMap(
  headers: IncomingMessage["headers"],
  removeConnectionHeaders = true,
): Record<string, string | string[]> {
  const connectionTokens = new Set(
    (headers.connection ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const removed = new Set([
    "connection",
    "proxy-connection",
    "proxy-authorization",
    "proxy-authenticate",
    "keep-alive",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);
  const result: Record<string, string | string[]> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (
      value === undefined ||
      name === "host" ||
      removed.has(name) ||
      (removeConnectionHeaders && connectionTokens.has(name))
    )
      continue;
    result[name] = value;
  }
  return result;
}
function responseHeaderMap(
  headers: IncomingMessage["headers"],
): Record<string, string | string[]> {
  return headerMap(headers);
}
function recordBlocked(
  events: BlockedEvent[],
  state: { sequence: number },
  origin: string,
  navigation: boolean,
  protocol: string,
): void {
  state.sequence++;
  events.push({ sequence: state.sequence, origin, navigation, protocol });
  if (events.length > EVENT_LIMIT)
    events.splice(0, events.length - EVENT_LIMIT);
}
function navigationRequest(request: IncomingMessage): boolean {
  const mode = request.headers["sec-fetch-mode"];
  const destination = request.headers["sec-fetch-dest"];
  return mode === "navigate" || destination === "document";
}
function decodeTarget(raw: string | undefined): URL | undefined {
  if (!raw || raw === "*") return undefined;
  try {
    const url = new URL(raw);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol))
      return undefined;
    if (url.username || url.password) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function serve(configFile: string): void {
  const config = readConfig(configFile);
  const origins = new Set(
    config.origins
      .map(normalizeOrigin)
      .filter((value): value is string => Boolean(value)),
  );
  if (
    !origins.size ||
    origins.size !== config.origins.length ||
    !config.instance ||
    !config.nonce
  )
    throw new Error("invalid browser proxy policy");
  const events: BlockedEvent[] = [];
  const state = { sequence: 0 };
  const sockets = new Set<import("node:net").Socket>();
  const server: Server = createServer(
    { maxHeaderSize: HEADER_LIMIT },
    (request, response) => {
      const target = request.url;
      if (
        target &&
        target.startsWith(HEALTH_PATH + "?") &&
        request.method === "GET" &&
        loopback(request.socket.remoteAddress)
      ) {
        const parsed = new URL(target, "http://127.0.0.1");
        if (parsed.searchParams.get("nonce") !== config.nonce) {
          sendError(response, 404, "Not found.");
          return;
        }
        if (parsed.pathname === HEALTH_PATH) {
          const after = Number(parsed.searchParams.get("after") ?? "0");
          const body: ProxyState = {
            pid: process.pid,
            instance: config.instance,
            nonce: config.nonce,
            sequence: state.sequence,
            blocked: events.filter(
              (event) =>
                event.sequence >
                (Number.isSafeInteger(after) && after >= 0 ? after : 0),
            ),
          };
          const data = JSON.stringify(body);
          response.writeHead(200, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(data),
            "cache-control": "no-store",
            connection: "close",
          });
          response.end(data);
          return;
        }
      }

      const url = decodeTarget(target);
      if (!url) {
        request.resume();
        sendError(response, 400, "Invalid proxy request.");
        return;
      }
      const targetOrigin = originFor(url);
      if (!targetOrigin || !origins.has(targetOrigin)) {
        recordBlocked(
          events,
          state,
          targetOrigin ?? url.origin,
          navigationRequest(request),
          url.protocol,
        );
        request.resume();
        sendError(response, 403, "Browser origin blocked by Spyglass.");
        return;
      }
      const headers = headerMap(request.headers);
      headers.host = url.host;
      const contentLength = request.headers["content-length"];
      if (contentLength && Number(contentLength) > BODY_LIMIT) {
        request.resume();
        sendError(response, 413, "Request body exceeds the Spyglass limit.");
        return;
      }
      const forward = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: request.method,
          headers,
          maxHeaderSize: HEADER_LIMIT,
          agent: undefined,
        },
        (upstream) => {
          const declaredLength = Number(upstream.headers["content-length"]);
          if (
            Number.isFinite(declaredLength) &&
            declaredLength > RESPONSE_BODY_LIMIT
          ) {
            upstream.destroy();
            sendError(
              response,
              502,
              "Browser response exceeds the Spyglass limit.",
            );
            return;
          }
          response.writeHead(
            upstream.statusCode ?? 502,
            responseHeaderMap(upstream.headers),
          );
          let responseBytes = 0;
          upstream.on("data", (chunk) => {
            responseBytes += Buffer.byteLength(chunk);
            if (responseBytes > RESPONSE_BODY_LIMIT) {
              upstream.destroy();
              if (response.headersSent) response.destroy();
              else
                sendError(
                  response,
                  502,
                  "Browser response exceeds the Spyglass limit.",
                );
            }
          });
          upstream.pipe(response);
          response.once("close", () => {
            if (!response.writableEnded) upstream.destroy();
          });
        },
      );
      let bodyBytes = 0;
      let connected = false;
      const connectTimer = setTimeout(() => {
        if (!connected) forward.destroy(new Error("upstream connect timeout"));
      }, CONNECT_TIMEOUT_MS);
      forward.on("socket", (socket) => {
        if (!socket.connecting) {
          connected = true;
          clearTimeout(connectTimer);
        } else
          socket.once("connect", () => {
            connected = true;
            clearTimeout(connectTimer);
          });
      });
      forward.setTimeout(REQUEST_TIMEOUT_MS, () =>
        forward.destroy(new Error("upstream request timeout")),
      );
      forward.on("error", () =>
        sendError(response, 502, "Browser upstream request failed."),
      );
      request.on("data", (chunk) => {
        bodyBytes += Buffer.byteLength(chunk);
        if (bodyBytes > BODY_LIMIT) {
          request.unpipe(forward);
          forward.destroy();
          sendError(response, 413, "Request body exceeds the Spyglass limit.");
          request.destroy();
        } else forward.write(chunk);
      });
      request.once("end", () => forward.end());
      request.once("aborted", () => forward.destroy());
      response.once("close", () => {
        if (!response.writableEnded) forward.destroy();
      });
    },
  );

  server.on("connect", (request, client, head) => {
    const authority = request.url ?? "";
    let url: URL | undefined;
    try {
      if (/^[^/?#\s]+(?::\d+)?$/.test(authority))
        url = new URL("https://" + authority);
      if (
        url &&
        (url.pathname !== "/" ||
          url.search ||
          url.hash ||
          url.username ||
          url.password)
      )
        url = undefined;
    } catch {
      url = undefined;
    }
    const origin = url?.origin;
    if (!url || !origin || !origins.has(origin)) {
      if (origin) recordBlocked(events, state, origin, false, "https:");
      client.end(
        "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    const port = Number(url.port || 443);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = netConnect({ host: socketHost(url.hostname), port });
    let connected = false;
    const timer = setTimeout(() => {
      if (!connected) upstream.destroy(new Error("upstream connect timeout"));
    }, CONNECT_TIMEOUT_MS);
    upstream.once("connect", () => {
      connected = true;
      clearTimeout(timer);
      client.write(
        "HTTP/1.1 200 Connection Established\r\nProxy-Agent: Spyglass\r\n\r\n",
      );
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.once("error", () => {
      clearTimeout(timer);
      if (!client.destroyed)
        client.end(
          "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
        );
    });
    client.once("error", () => upstream.destroy());
    client.once("close", () => upstream.destroy());
  });

  server.on("upgrade", (request, client, head) => {
    const url = decodeTarget(request.url);
    const origin = url && originFor(url);
    if (!url || !origin || !origins.has(origin)) {
      if (origin)
        recordBlocked(
          events,
          state,
          origin,
          navigationRequest(request),
          url?.protocol ?? "unknown",
        );
      client.end(
        "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    const secure = url.protocol === "https:" || url.protocol === "wss:";
    const upstreamUrl = new URL(url.href);
    upstreamUrl.protocol = secure ? "https:" : "http:";
    const headers = headerMap(request.headers, false);
    headers.host = upstreamUrl.host;
    headers.connection = "Upgrade";
    headers.upgrade = request.headers.upgrade ?? "websocket";
    const forward = (secure ? httpsRequest : httpRequest)(upstreamUrl, {
      method: request.method,
      headers,
      maxHeaderSize: HEADER_LIMIT,
    });
    let connected = false;
    const timer = setTimeout(() => {
      if (!connected) forward.destroy(new Error("upstream connect timeout"));
    }, CONNECT_TIMEOUT_MS);
    forward.on("socket", (socket) => {
      if (!socket.connecting) {
        connected = true;
        clearTimeout(timer);
      } else
        socket.once("connect", () => {
          connected = true;
          clearTimeout(timer);
        });
    });
    forward.on("upgrade", (response, upstream, responseHead) => {
      clearTimeout(timer);
      const headersOut = Object.entries(response.headers).flatMap(
        ([name, value]) =>
          value === undefined
            ? []
            : Array.isArray(value)
              ? value.map((item) => `${name}: ${item}`)
              : [`${name}: ${value}`],
      );
      client.write(
        `HTTP/1.1 ${response.statusCode ?? 101} ${response.statusMessage ?? "Switching Protocols"}\r\n${headersOut.join("\r\n")}\r\n\r\n`,
      );
      if (responseHead.length) client.write(responseHead);
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    forward.on("response", (response) => {
      clearTimeout(timer);
      const headersOut = Object.entries(response.headers).flatMap(
        ([name, value]) =>
          value === undefined
            ? []
            : Array.isArray(value)
              ? value.map((item) => `${name}: ${item}`)
              : [`${name}: ${value}`],
      );
      client.write(
        `HTTP/1.1 ${response.statusCode ?? 502} ${response.statusMessage ?? "Bad Gateway"}\r\n${headersOut.join("\r\n")}\r\n\r\n`,
      );
      response.pipe(client);
    });
    forward.on("error", () => {
      clearTimeout(timer);
      if (!client.destroyed)
        client.end(
          "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
        );
    });
    client.once("error", () => forward.destroy());
    client.once("close", () => forward.destroy());
    forward.end();
  });

  server.maxConnections = 64;
  server.maxHeadersCount = 100;
  server.headersTimeout = 15_000;
  server.requestTimeout = 35_000;
  server.keepAliveTimeout = 5_000;
  server.on("clientError", (_error, socket) => {
    if (socket.writable)
      socket.end(
        "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("proxy did not bind a TCP port");
    }
    const tmp = config.ready + "." + randomUUID() + ".tmp";
    writeFileSync(
      tmp,
      JSON.stringify({
        port: address.port,
        pid: process.pid,
        instance: config.instance,
      }) + "\n",
      { mode: 0o600 },
    );
    chmodSync(tmp, 0o600);
    try {
      renameSync(tmp, config.ready);
    } catch {
      rmSync(tmp, { force: true });
      throw new Error("cannot publish proxy readiness");
    }
  });
  const stop = () => {
    server.close(() => process.exit(0));
    for (const socket of sockets) socket.destroy();
    setTimeout(() => process.exit(0), 100).unref();
  };
  // Every ui command checks proxy health, so a connection marks browser use.
  // Outlive the browser's own idle shutdown so a live browser keeps its proxy.
  const idleTimeoutMs = config.idleTimeoutMs ?? BROWSER_IDLE_TIMEOUT_MS;
  const idle = setTimeout(
    stop,
    idleTimeoutMs + Math.min(idleTimeoutMs, 60_000),
  );
  server.on("connection", (socket) => {
    idle.refresh();
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

function proxyFault(
  code: string,
  message: string,
  next: string,
  exitCode = 3,
): Fault {
  return new Fault(code, message, next, exitCode);
}
function healthRequest(
  port: number,
  nonce: string,
  after = 0,
): Promise<ProxyState | undefined> {
  return new Promise((resolve) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: `${HEALTH_PATH}?nonce=${encodeURIComponent(nonce)}&after=${after}`,
        method: "GET",
        agent: false,
        timeout: 1_000,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 64 * 1024) chunks.push(chunk);
          else request.destroy();
        });
        response.once("end", () => {
          try {
            if (response.statusCode !== 200) {
              resolve(undefined);
              return;
            }
            const state = JSON.parse(
              Buffer.concat(chunks).toString("utf8"),
            ) as ProxyState;
            resolve(
              Number.isInteger(state.pid) &&
                typeof state.instance === "string" &&
                typeof state.nonce === "string" &&
                Number.isInteger(state.sequence) &&
                Array.isArray(state.blocked)
                ? state
                : undefined,
            );
          } catch {
            resolve(undefined);
          }
        });
      },
    );
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(undefined));
    request.end();
  });
}
async function waitUntilGone(
  pid: number,
  identity: string,
  timeoutMs: number,
): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const live = processIdentity(pid);
    if (!live || live !== identity) return true;
    await delay(50);
  }
  return !processIdentity(pid) || processIdentity(pid) !== identity;
}
async function stopOwned(pid: number, identity: string): Promise<void> {
  const live = processIdentity(pid);
  if (!live) return;
  if (live !== identity)
    throw proxyFault(
      "BROWSER_PROXY_OWNERSHIP",
      "The browser proxy PID now belongs to a different process.",
      "Inspect run state; Spyglass will not stop a process that it cannot identify.",
      3,
    );
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ESRCH"
    ))
      throw error;
  }
  if (await waitUntilGone(pid, identity, 1_500)) return;
  if (processIdentity(pid) !== identity) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ESRCH"
    ))
      throw error;
  }
  if (!(await waitUntilGone(pid, identity, 1_500)))
    throw proxyFault(
      "BROWSER_PROXY_CLEANUP_FAILED",
      "The browser proxy did not stop.",
      "Inspect the saved proxy PID and retry spyglass down.",
      3,
    );
}
function removeFiles(run: Run): void {
  rmSync(readyPath(run), { force: true });
  rmSync(configPath(run), { force: true });
}
function metadata(run: Run): ProxyMetadata | undefined {
  const value = run.browserProxy;
  if (!value) return undefined;
  if (
    !Number.isInteger(value.pid) ||
    value.pid < 1 ||
    !Number.isInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535 ||
    typeof value.identity !== "string" ||
    typeof value.instance !== "string" ||
    !Array.isArray(value.origins) ||
    !Number.isInteger(value.sequence)
  ) {
    throw proxyFault(
      "BROWSER_PROXY_STATE",
      "Saved browser proxy ownership data is incomplete.",
      "Inspect the retained run state; do not attach to an unknown proxy.",
      3,
    );
  }
  return value;
}
function hasSessions(run: Run): boolean {
  return Object.keys(run.sessions).length > 0;
}

export async function ensureBrowserProxy(
  run: Run,
  origins: Iterable<string>,
  idleTimeoutMs: number,
): Promise<boolean> {
  const allowed = ordered(origins);
  if (
    !allowed.length ||
    allowed.some((origin) => normalizeOrigin(origin) !== origin)
  )
    throw proxyFault(
      "BROWSER_ORIGIN_POLICY",
      "The browser proxy needs valid exact HTTP or HTTPS origins.",
      "Set run.web, run.api or browser.allowedOrigins to origin values.",
      2,
    );
  const existing = metadata(run);
  if (existing) {
    let config: ProxyConfig | undefined;
    try {
      config = readConfig(configPath(run));
    } catch {
      config = undefined;
    }
    if (
      config &&
      config.instance === existing.instance &&
      JSON.stringify(ordered(config.origins)) === JSON.stringify(allowed)
    ) {
      const state = await healthRequest(existing.port, config.nonce);
      if (
        state &&
        state.pid === existing.pid &&
        state.instance === existing.instance &&
        state.nonce === config.nonce
      )
        return false;
    }
    if (hasSessions(run))
      throw proxyFault(
        "BROWSER_PROXY_UNAVAILABLE",
        "The owned browser proxy is unavailable or its origin policy changed.",
        "Run spyglass down to close this browser session, then create a new run.",
        3,
      );
    if (processIdentity(existing.pid) === existing.identity) {
      await stopOwned(existing.pid, existing.identity);
    }
    run.browserProxy = undefined;
    removeFiles(run);
    saveRun(run);
  } else if (hasSessions(run)) {
    throw proxyFault(
      "BROWSER_PROXY_STATE",
      "This run has a browser session but no owned exact-origin proxy record.",
      "Run spyglass down; Spyglass will not attach to a browser without its recorded network policy.",
      3,
    );
  }

  const directory = proxyDirectory(run);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const instance = randomUUID();
  const nonce = randomUUID();
  const ready = readyPath(run);
  const configFile = configPath(run);
  rmSync(ready, { force: true });
  const config: ProxyConfig = {
    origins: allowed,
    instance,
    nonce,
    ready,
    idleTimeoutMs,
  };
  writeFileSync(configFile, JSON.stringify(config) + "\n", { mode: 0o600 });
  chmodSync(configFile, 0o600);
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "WINDIR",
  ])
    if (process.env[key] !== undefined) env[key] = process.env[key];
  env.PATH ??= "/usr/bin:/bin";
  env.HOME ??= homedir();
  const script = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [script, "--serve", configFile], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  if (!child.pid) {
    removeFiles(run);
    throw proxyFault(
      "BROWSER_PROXY_START",
      "Cannot start the run-owned browser proxy.",
      "Check the Node.js installation and retry the browser command.",
      3,
    );
  }
  const identity = processIdentity(child.pid);
  if (!identity) {
    removeFiles(run);
    throw proxyFault(
      "BROWSER_PROXY_START",
      "Cannot verify the browser proxy process identity.",
      "Check local process inspection and retry the browser command.",
      3,
    );
  }
  const deadline = Date.now() + START_TIMEOUT_MS;
  let published: { port: number; pid: number; instance: string } | undefined;
  try {
    while (Date.now() < deadline) {
      if (processIdentity(child.pid) !== identity) break;
      try {
        const value = JSON.parse(readFileSync(ready, "utf8")) as {
          port?: number;
          pid?: number;
          instance?: string;
        };
        if (
          Number.isInteger(value.port) &&
          value.port! > 0 &&
          Number.isInteger(value.pid) &&
          typeof value.instance === "string"
        )
          published = value as { port: number; pid: number; instance: string };
      } catch {
        /* Wait for the child to publish a complete record. */
      }
      if (published?.pid === child.pid && published.instance === instance) {
        const state = await healthRequest(published.port, nonce);
        if (
          state &&
          state.pid === child.pid &&
          state.instance === instance &&
          state.nonce === nonce
        )
          break;
      }
      await delay(50);
    }
    const state = published
      ? await healthRequest(published.port, nonce)
      : undefined;
    if (
      !published ||
      !state ||
      state.pid !== child.pid ||
      state.instance !== instance ||
      state.nonce !== nonce ||
      processIdentity(child.pid) !== identity
    ) {
      if (processIdentity(child.pid) === identity)
        await stopOwned(child.pid, identity).catch(() => undefined);
      removeFiles(run);
      throw proxyFault(
        "BROWSER_PROXY_START",
        "The run-owned exact-origin browser proxy did not become ready.",
        "Check that loopback ports are available and retry the browser command.",
        3,
      );
    }
    run.browserProxy = {
      pid: child.pid,
      identity,
      port: published.port,
      origins: allowed,
      instance,
      sequence: state.sequence,
    };
    rmSync(ready, { force: true });
    saveRun(run);
    return true;
  } catch (error) {
    if (processIdentity(child.pid) === identity)
      await stopOwned(child.pid, identity).catch(() => undefined);
    removeFiles(run);
    throw error;
  }
}

export async function browserProxyEvents(
  run: Run,
  after: number,
): Promise<{ sequence: number; blocked: BlockedEvent[] }> {
  const saved = metadata(run);
  if (!saved)
    throw proxyFault(
      "BROWSER_PROXY_STATE",
      "The run has no owned browser proxy.",
      "Start a new run before using its browser.",
      3,
    );
  let config: ProxyConfig;
  try {
    config = readConfig(configPath(run));
  } catch {
    throw proxyFault(
      "BROWSER_PROXY_UNAVAILABLE",
      "The browser proxy policy file is missing.",
      "Run spyglass down and create a new run.",
      3,
    );
  }
  const state = await healthRequest(saved.port, config.nonce, after);
  if (
    !state ||
    state.pid !== saved.pid ||
    state.instance !== saved.instance ||
    state.nonce !== config.nonce
  ) {
    throw proxyFault(
      "BROWSER_PROXY_UNAVAILABLE",
      "The browser proxy health check failed.",
      "Run spyglass down and create a new run.",
      3,
    );
  }
  return { sequence: state.sequence, blocked: state.blocked };
}

// A health reply that carries the run's secret nonce proves that this run
// still owns the proxy at the saved PID.
async function verifiedHealth(
  run: Run,
  saved: ProxyMetadata,
): Promise<ProxyState | undefined> {
  let config: ProxyConfig;
  try {
    config = readConfig(configPath(run));
  } catch {
    return undefined;
  }
  const state = await healthRequest(saved.port, config.nonce);
  return state &&
    state.pid === saved.pid &&
    state.instance === saved.instance &&
    state.nonce === config.nonce
    ? state
    : undefined;
}

export async function browserProxyLive(run: Run): Promise<boolean> {
  const saved = metadata(run);
  return Boolean(saved && (await verifiedHealth(run, saved)));
}

export async function stopBrowserProxy(run: Run): Promise<void> {
  const saved = metadata(run);
  if (!saved) return;
  const live = processIdentity(saved.pid);
  if (live && live !== saved.identity) {
    // The saved start time can differ in format (a run recorded before ps
    // was pinned to C/UTC). Stop the process only on the nonce proof; with
    // no proof the PID belongs to another process and the proxy is gone.
    if (await verifiedHealth(run, saved)) await stopOwned(saved.pid, live);
  } else if (live) {
    let config: ProxyConfig | undefined;
    try {
      config = readConfig(configPath(run));
    } catch {
      config = undefined;
    }
    if (config) {
      const health = await healthRequest(saved.port, config.nonce);
      if (
        health &&
        (health.pid !== saved.pid ||
          health.instance !== saved.instance ||
          health.nonce !== config.nonce)
      ) {
        throw proxyFault(
          "BROWSER_PROXY_OWNERSHIP",
          "The browser proxy port is served by a different instance.",
          "Inspect run state; Spyglass will not stop an unverified proxy.",
          3,
        );
      }
    }
    await stopOwned(saved.pid, saved.identity);
  }
  run.browserProxy = undefined;
  removeFiles(run);
  saveRun(run);
}

function main(): void {
  if (process.argv[2] !== "--serve" || !process.argv[3]) return;
  try {
    serve(process.argv[3]!);
  } catch {
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main();
