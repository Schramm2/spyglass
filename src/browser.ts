import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Fault } from "./errors.js";
import { hash, safePath } from "./files.js";
import { BROWSER_IDLE_TIMEOUT_MS, stateRoot, saveRun } from "./state.js";
import {
  browserProxyEvents,
  browserProxyLive,
  ensureBrowserProxy,
  stopBrowserProxy,
} from "./browser-proxy.js";
import type { Context } from "./state.js";

type Command = string[];
type Identity = { namespace: string; session: string; seat: string };
type Reply = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  parsed: unknown;
  items: unknown[];
};

const safeCommands = new Set([
  "open",
  "read",
  "click",
  "dblclick",
  "type",
  "fill",
  "press",
  "keyboard",
  "hover",
  "focus",
  "check",
  "uncheck",
  "select",
  "drag",
  "scroll",
  "scrollintoview",
  "wait",
  "back",
  "forward",
  "reload",
  "screenshot",
  "snapshot",
  "get",
  "is",
  "find",
  "network",
  "console",
  "errors",
  "tab",
  "window",
  "set",
  "vitals",
  "a11y",
  "pushstate",
  "diff",
  "session",
]);
const blockedCommands = new Set([
  "auth",
  "cookies",
  "storage",
  "state",
  "connect",
  "mcp",
  "chat",
  "plugin",
  "dashboard",
  "upload",
  "download",
  "pdf",
  "record",
  "trace",
  "profiler",
  "clipboard",
  "inspect",
  "install",
  "upgrade",
  "profiles",
]);
const forbiddenFlags = new Set([
  "--config",
  "--namespace",
  "--session",
  "--profile",
  "--restore",
  "--restore-save",
  "--restore-check-url",
  "--restore-check-text",
  "--restore-check-fn",
  "--session-name",
  "--state",
  "--auto-connect",
  "--cdp",
  "--provider",
  "-p",
  "--executable-path",
  "--extension",
  "--init-script",
  "--args",
  "--allowed-domains",
  "--proxy",
  "--proxy-bypass",
  "--ignore-https-errors",
  "--ca-cert",
  "--no-ca-cert",
  "--allow-file-access",
  "--headed",
  "--screenshot-dir",
  "--download-path",
  "--action-policy",
  "--confirm-actions",
  "--confirm-interactive",
  "--engine",
  "--enable",
  "--pin-tab",
  "--no-pin-tab",
  "--headers",
]);
const privateKey =
  /(?:pass(?:word)?|authorization|cookie|token|secret|credential|api[-_]?key|access[-_]?key)/i;
const secretQuery =
  /([?&][^=&]*(?:pass(?:word)?|auth|cookie|token|secret|key|session)[^=&]*=)[^&#\s]*/gi;
const jwt = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function identity(ctx: Context, seat: string): Identity {
  const key = hash(ctx.run.repo + "\0" + ctx.run.id);
  return {
    namespace: "sg-" + key.slice(0, 12),
    session: "s-" + hash(seat).slice(0, 12),
    seat,
  };
}
function configFile(ctx: Context): string {
  const dir = join(stateRoot(ctx.run.repo), ctx.run.id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "browser-config.json");
  writeFileSync(file, '{"headed":false,"hideScrollbars":true}\n', {
    mode: 0o600,
  });
  chmodSync(file, 0o600);
  return file;
}
function browserEnv(
  config: string,
  id: Identity,
  domains: string,
  idleTimeoutMs: number,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SystemRoot",
    "WINDIR",
  ]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.HOME ??= homedir();
  env.PATH ??= "/usr/bin:/bin";
  env.AGENT_BROWSER_CONFIG = config;
  env.AGENT_BROWSER_NAMESPACE = id.namespace;
  env.AGENT_BROWSER_SESSION = id.session;
  env.AGENT_BROWSER_ALLOWED_DOMAINS = domains;
  env.AGENT_BROWSER_CONTENT_BOUNDARIES = "1";
  env.AGENT_BROWSER_PIN_TAB = "1";
  env.AGENT_BROWSER_IDLE_TIMEOUT_MS = String(idleTimeoutMs);
  return env;
}
function idleTimeoutMs(ctx: Context): number {
  return ctx.run.profile.browser?.idleTimeoutMs ?? BROWSER_IDLE_TIMEOUT_MS;
}
function origins(ctx: Context): { exact: Set<string>; domains: string } {
  const configured = ctx.run.profile.browser?.allowedOrigins ?? [];
  const runtime = [ctx.run.web, ctx.run.api].filter((value): value is string =>
    Boolean(value),
  );
  const exact = new Set<string>();
  const hosts = new Set<string>();
  for (const value of configured) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Fault(
        "BROWSER_ORIGIN_POLICY",
        "Invalid browser allowed origin: " + value + ".",
        "Use browser.allowedOrigins with HTTP or HTTPS origins.",
      );
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      throw new Fault(
        "BROWSER_ORIGIN_POLICY",
        "Browser origins must be HTTP or HTTPS origins without credentials, paths, queries or fragments: " +
          value +
          ".",
        "Use an origin such as http://127.0.0.1:3000.",
      );
    }
    exact.add(url.origin);
    hosts.add(url.hostname);
  }
  for (const value of runtime) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Fault(
        "BROWSER_ORIGIN_POLICY",
        "Invalid run web or API address: " + value + ".",
        "Use an HTTP or HTTPS address in the Spyglass profile.",
      );
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Fault(
        "BROWSER_ORIGIN_POLICY",
        "Run web and API addresses must use HTTP or HTTPS without credentials: " +
          value +
          ".",
        "Use an HTTP or HTTPS service address.",
      );
    }
    exact.add(url.origin);
    hosts.add(url.hostname);
  }
  if (!exact.size)
    throw new Fault(
      "BROWSER_ORIGIN_POLICY",
      "No browser origin is configured for this run.",
      "Set web or browser.allowedOrigins in spyglass.json.",
    );
  return { exact, domains: [...hosts].sort().join(",") };
}
function checkUrl(ctx: Context, value: string, base?: string): string {
  let url: URL;
  try {
    url = base ? new URL(value, base) : new URL(value);
  } catch {
    throw new Fault(
      "BROWSER_URL",
      "Invalid browser URL: " + value + ".",
      "Use a path relative to the run web address or an allowed HTTP or HTTPS URL.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !origins(ctx).exact.has(url.origin)
  ) {
    throw new Fault(
      "BROWSER_ORIGIN_BLOCKED",
      "Blocked browser origin " + url.origin + ".",
      "Use the run web address or add this exact origin to browser.allowedOrigins.",
      1,
      { blockedOrigin: url.origin },
    );
  }
  return url.toString();
}
function redactText(ctx: Context, text: string): string {
  return ctx.vault
    .text(text)
    .replace(secretQuery, "$1[REDACTED]")
    .replace(jwt, "[REDACTED_TOKEN]")
    .replace(/(Bearer\s+)[^\s"\\]+/gi, "$1[REDACTED]")
    .replace(
      /((?:password|authorization|cookie|token|secret|api[-_]?key|access[-_]?key)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}
function clean(ctx: Context, value: unknown, key = ""): unknown {
  if (privateKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(ctx, value);
  if (Array.isArray(value)) return value.map((item) => clean(ctx, item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        clean(ctx, item, name),
      ]),
    );
  return value;
}
function decode(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const starts = [trimmed.indexOf("{"), trimmed.indexOf("[")].filter(
      (n) => n >= 0,
    );
    if (starts.length) {
      const start = Math.min(...starts);
      const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* Return plain output. */
      }
    }
    return trimmed;
  }
}
function items(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { data?: unknown }).data)
  )
    return (parsed as { data: unknown[] }).data;
  return parsed === null ? [] : [parsed];
}
function globalArgs(
  config: string,
  id: Identity,
  domains: string,
  idleTimeoutMs: number,
  proxyPort?: number,
): string[] {
  return [
    "--config",
    config,
    "--namespace",
    id.namespace,
    "--session",
    id.session,
    "--allowed-domains",
    domains,
    ...(proxyPort
      ? [
          "--proxy",
          `http://127.0.0.1:${proxyPort}`,
          "--proxy-bypass",
          "<-loopback>",
        ]
      : []),
    "--content-boundaries",
    "--pin-tab",
    "--idle-timeout",
    String(idleTimeoutMs),
    "--json",
  ];
}
async function invoke(
  ctx: Context,
  id: Identity,
  domains: string,
  command: string[],
  input?: string,
  timeoutMs = 60000,
): Promise<Reply> {
  const config = configFile(ctx),
    idle = idleTimeoutMs(ctx),
    calledAt = new Date().toISOString();
  const result = await ctx.execute(
    [
      "agent-browser",
      ...globalArgs(config, id, domains, idle, ctx.run.browserProxy?.port),
      ...command,
    ],
    {
      env: browserEnv(config, id, domains, idle),
      input,
      timeoutMs,
      maxBytes: 8 * 1024 * 1024,
    },
  );
  const parsed = decode(result.stdout);
  // Only a successful command proves that the daemon ran it and reset its
  // idle timer; agent-browser can reject a command without its daemon.
  if (result.exitCode === 0) (ctx.run.browserUsedAt ??= {})[id.seat] = calledAt;
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    parsed,
    items: items(parsed),
  };
}
function metadata(ctx: Context, reply: Reply): Record<string, unknown> {
  const root = reply.parsed;
  if (!root || typeof root !== "object")
    throw new Fault(
      "BROWSER_METADATA",
      "agent-browser did not return session metadata.",
      "Run agent-browser doctor and inspect the browser installation.",
      3,
    );
  const row = root as Record<string, unknown>;
  const data =
    row.data && typeof row.data === "object"
      ? (row.data as Record<string, unknown>)
      : row;
  if (
    typeof data.active !== "boolean" ||
    typeof data.session !== "string" ||
    typeof data.namespace !== "string"
  ) {
    throw new Fault(
      "BROWSER_METADATA",
      "agent-browser returned incomplete session metadata.",
      "Run agent-browser doctor and inspect the browser installation.",
      3,
      { metadata: clean(ctx, data) },
    );
  }
  return data;
}
async function inspect(
  ctx: Context,
  id: Identity,
  domains: string,
): Promise<Record<string, unknown>> {
  const reply = await invoke(
    ctx,
    id,
    domains,
    ["session", "info", "--json"],
    undefined,
    15000,
  );
  if (reply.exitCode !== 0)
    throw new Fault(
      "BROWSER_METADATA",
      "Cannot inspect the run browser session: " +
        redactText(ctx, reply.stderr || reply.stdout),
      "Run agent-browser doctor and inspect the retained run.",
      3,
    );
  const meta = metadata(ctx, reply);
  // An inactive probe starts no daemon, so it is not a use of the seat.
  if (!meta.active) delete ctx.run.browserUsedAt?.[id.seat];
  return meta;
}
// Margin for a command that ends a few seconds after its last browser call.
const EXPIRY_CHECK_MARGIN_MS = 5_000;
function mayHaveExpired(ctx: Context, seat: string): boolean {
  const usedAt = ctx.run.browserUsedAt?.[seat];
  return (
    !usedAt ||
    Date.now() - Date.parse(usedAt) >=
      idleTimeoutMs(ctx) - EXPIRY_CHECK_MARGIN_MS
  );
}
function expiryText(ctx: Context): string {
  const idle = idleTimeoutMs(ctx);
  return idle >= 60_000
    ? `${Math.round(idle / 60_000)} min`
    : `${Math.round(idle / 1000)} s`;
}
const EXPIRED_NEXT =
  "Run the ui command again to start a new browser for this run. Sign in again first with spyglass ui login <seat> when the seat needs it.";
// agent-browser shuts an idle daemon down and discards the seat's pages and
// sign-in state; its next command would silently start a signed-out browser.
// Probe only the seat this command uses, and only when it may have expired,
// so a busy run pays no extra call. The proxy outlives every seat's browser:
// while any seat is recent it is live, and once it is gone every recorded
// seat must be checked.
async function expireIdleBrowsers(
  ctx: Context,
  seat: string,
  domains: string,
): Promise<void> {
  const stale = Object.keys(ctx.run.sessions).filter((recorded) =>
    mayHaveExpired(ctx, recorded),
  );
  if (!stale.length) return;
  const proxyLive = !ctx.run.browserProxy || (await browserProxyLive(ctx.run));
  const candidates = proxyLive
    ? stale.filter((recorded) => recorded === seat)
    : Object.keys(ctx.run.sessions);
  const expired: string[] = [];
  for (const candidate of candidates)
    if (!(await inspect(ctx, identity(ctx, candidate), domains)).active)
      expired.push(candidate);
  if (!expired.length) return;
  for (const candidate of expired) {
    delete ctx.run.sessions[candidate];
    if (ctx.run.activeSeat === candidate) ctx.run.activeSeat = "default";
  }
  if (!Object.keys(ctx.run.sessions).length && ctx.run.browserProxy)
    await stopBrowserProxy(ctx.run);
  saveRun(ctx.run);
  if (expired.includes(seat))
    throw new Fault(
      "BROWSER_EXPIRED",
      `The run browser for seat ${seat} shut down after ${expiryText(ctx)} without a ui command. Its pages and sign-in state are gone.`,
      EXPIRED_NEXT,
      3,
      { expiredSeats: expired },
    );
}
async function ensure(
  ctx: Context,
  id: Identity,
  domains: string,
): Promise<boolean> {
  const recorded = ctx.run.sessions[id.seat];
  if (recorded && recorded !== id.session)
    throw new Fault(
      "BROWSER_OWNERSHIP",
      "The recorded browser session does not match this run and seat.",
      "Inspect run state; do not attach to a foreign browser.",
      3,
    );
  if (recorded) return false;
  const meta = await inspect(ctx, id, domains);
  if (meta.active)
    throw new Fault(
      "BROWSER_OWNERSHIP",
      "A browser session already exists at the run-owned session name, but this run did not create it.",
      "Use a new run ID; Spyglass will not attach to that browser.",
      3,
    );
  return true;
}
function parseWords(value: string): string[] {
  const words: string[] = [];
  let word = "",
    quote = "",
    escaped = false,
    started = false;
  for (const char of value) {
    if (escaped) {
      word += char;
      escaped = false;
      started = true;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else word += char;
      started = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        words.push(word);
        word = "";
        started = false;
      }
      continue;
    }
    word += char;
    started = true;
  }
  if (escaped || quote)
    throw new Fault(
      "BROWSER_BATCH",
      "A batch command has unmatched quotes or escapes.",
      "Quote each command as plain arguments; shell expansion is not supported.",
    );
  if (started) words.push(word);
  return words;
}
function flatten(args: string[]): Command[] {
  if (args[0] !== "batch") return [args];
  const values = args
    .slice(1)
    .filter((value) => value !== "--bail" && value !== "--json");
  if (values.some((value) => value.startsWith("--")))
    throw new Fault(
      "BROWSER_POLICY",
      "This batch option is not supported by Spyglass.",
      "Spyglass owns the browser session, origin policy and output format.",
    );
  if (values.length === 1 && values[0]!.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(values[0]!);
    } catch {
      throw new Fault(
        "BROWSER_BATCH",
        "The batch JSON is invalid.",
        "Pass a JSON array of browser command arrays.",
      );
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (row) =>
          Array.isArray(row) && row.every((word) => typeof word === "string"),
      )
    )
      throw new Fault(
        "BROWSER_BATCH",
        "The batch JSON must contain arrays of string arguments.",
        'Pass arrays such as [["open","/"],["snapshot","-i"]].',
      );
    return parsed as Command[];
  }
  const commands = values.map(parseWords);
  if (!commands.length || commands.length > 30)
    throw new Fault(
      "BROWSER_BATCH",
      "A batch must contain between 1 and 30 commands.",
      "Use smaller batches so each operation has clear evidence.",
    );
  if (commands.some((command) => command[0] === "batch"))
    throw new Fault(
      "BROWSER_BATCH",
      "Nested agent-browser batches are disabled.",
      "Pass one flat batch; nested batches can hide policy changes.",
    );
  return commands;
}
function flagValueIndices(command: Command): Set<number> {
  const skip = new Set<number>(),
    head = command[0];
  if (["open", "read", "pushstate", "vitals", "a11y"].includes(head ?? ""))
    skip.add(1);
  if (head === "fill" || head === "type") {
    skip.add(1);
    skip.add(2);
  }
  if (head === "keyboard" && command[1] === "type") skip.add(2);
  if (head === "get") {
    skip.add(1);
    skip.add(2);
  }
  if (head === "find") {
    skip.add(1);
    skip.add(2);
    for (let i = 3; i < command.length; i++)
      if (command[i] === "--name") skip.add(i + 1);
  }
  if (head === "select") {
    skip.add(1);
    for (let i = 2; i < command.length; i++) skip.add(i);
  }
  if (head === "press") skip.add(1);
  if (head === "set") for (let i = 2; i < command.length; i++) skip.add(i);
  return skip;
}
function validate(ctx: Context, command: Command): Command {
  if (!command.length || !command[0])
    throw new Fault(
      "BROWSER_COMMAND",
      "A browser command is empty.",
      "Use spyglass ui --help for supported operations.",
    );
  const head = command[0]!,
    sub = command[1];
  if (blockedCommands.has(head))
    throw new Fault(
      "BROWSER_POLICY",
      "The browser command " +
        head +
        " can expose credentials, use saved state or write outside run evidence.",
      "Use Spyglass ui login and ui proof for isolated authentication and evidence.",
    );
  if (!safeCommands.has(head))
    throw new Fault(
      "BROWSER_COMMAND",
      "Unsupported agent-browser command: " + head + ".",
      "Run spyglass ui --help for supported commands and limits.",
    );
  if (head === "session" && sub !== "info")
    throw new Fault(
      "BROWSER_POLICY",
      "This session operation can affect or reveal other browser sessions.",
      "Use spyglass down to close only this run-owned session.",
    );
  if (
    head === "get" &&
    (sub === "value" || (sub === "attr" && command[3] === "value"))
  )
    throw new Fault(
      "BROWSER_POLICY",
      "Reading input values can expose credentials and tokens.",
      "Inspect an accessibility snapshot or visible text instead.",
    );
  if (head === "set" && ["headers", "credentials", "geo"].includes(sub ?? ""))
    throw new Fault(
      "BROWSER_POLICY",
      "This setting can expose credentials or change the target location.",
      "Use a configured seat or repository-owned check.",
    );
  if (head === "network" && sub !== "requests")
    throw new Fault(
      "BROWSER_POLICY",
      "This network operation can alter requests or retain authorization data.",
      "Use spyglass api and ui proof.",
    );
  if (head === "diff" && sub === "screenshot")
    throw new Fault(
      "BROWSER_POLICY",
      "Screenshot baselines must be in run evidence.",
      "Use spyglass ui proof LABEL and inspect its screenshot.",
    );
  if (head === "tab" && sub === "new") {
    const targetIndex = command[2] === "--label" ? 4 : 2;
    if (command[targetIndex])
      command[targetIndex] = checkUrl(ctx, command[targetIndex]!, ctx.run.web);
  }
  if (head === "diff" && sub === "url") {
    if (command[2]) command[2] = checkUrl(ctx, command[2]!, ctx.run.web);
    if (command[3]) command[3] = checkUrl(ctx, command[3]!, ctx.run.web);
  }
  if (
    head === "wait" &&
    command.some((arg) => /^--(fn|download)(=|$)/.test(arg))
  )
    throw new Fault(
      "BROWSER_POLICY",
      "wait --fn runs page JavaScript and wait --download saves outside run evidence.",
      "Wait for a selector, --text, --url or --load.",
    );
  const skipped = flagValueIndices(command);
  for (let i = 1; i < command.length; i++)
    if (!skipped.has(i))
      for (const flag of forbiddenFlags) {
        if (command[i] === flag || command[i]!.startsWith(flag + "="))
          throw new Fault(
            "BROWSER_POLICY",
            "The browser flag " + flag + " conflicts with run isolation.",
            "Spyglass owns browser configuration, session, origin limits and artifact paths.",
          );
      }
  if (head === "open" && command[1])
    command[1] = checkUrl(ctx, command[1], ctx.run.web);
  if (head === "read" && command[1] && !command[1]!.startsWith("-"))
    command[1] = checkUrl(ctx, command[1]!, ctx.run.web);
  if (
    ["pushstate", "vitals", "a11y"].includes(head) &&
    command[1] &&
    !command[1]!.startsWith("-")
  )
    command[1] = checkUrl(ctx, command[1]!, ctx.run.web);
  return command;
}
function proofPath(ctx: Context, label: string): string {
  const name =
    label
      .replace(/[^A-Za-z0-9_.-]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 80) || "proof";
  const dir = join(ctx.run.evidence, "spyglass");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return safePath(
    dir,
    join(
      dir,
      "browser-" +
        ctx.step.id +
        "-" +
        name +
        "-" +
        randomUUID().slice(0, 8) +
        ".png",
    ),
  );
}
function imageArtifact(
  ctx: Context,
  file: string,
  name: string,
): Record<string, unknown> {
  if (!existsSync(file))
    throw new Fault(
      "BROWSER_ARTIFACT_MISSING",
      "agent-browser did not create a screenshot.",
      "Inspect the browser output and retry the proof.",
    );
  const bytes = readFileSync(file);
  if (!bytes.length)
    throw new Fault(
      "BROWSER_ARTIFACT_EMPTY",
      "agent-browser created an empty screenshot.",
      "Inspect the browser output and retry the proof.",
    );
  const artifact = ctx.artifact(name, bytes, "image");
  rmSync(file, { force: true });
  return artifact as unknown as Record<string, unknown>;
}
async function run(
  ctx: Context,
  id: Identity,
  domains: string,
  commands: Command[],
  timeout = 60000,
): Promise<{ reply: Reply; data: unknown[] }> {
  const after = ctx.run.browserProxy?.sequence ?? 0;
  const reply = await invoke(
    ctx,
    id,
    domains,
    ["batch", "--bail", "--json"],
    JSON.stringify(commands),
    timeout,
  );
  const proxyState = await browserProxyEvents(ctx.run, after);
  if (ctx.run.browserProxy && proxyState.sequence !== after) {
    ctx.run.browserProxy.sequence = proxyState.sequence;
    saveRun(ctx.run);
  }
  const blockedNavigation = proxyState.blocked.find(
    (event) => event.navigation,
  );
  if (blockedNavigation)
    throw new Fault(
      "BROWSER_ORIGIN_BLOCKED",
      "Blocked browser origin " + blockedNavigation.origin + ".",
      "Use the run web address or add this exact origin to browser.allowedOrigins.",
      1,
      { blockedOrigin: blockedNavigation.origin },
    );
  const data = reply.items.map((item) => clean(ctx, item));
  const failed = reply.items.some((item) =>
    Boolean(
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).success === false,
    ),
  );
  if (reply.timedOut || reply.exitCode !== 0 || failed) {
    const detail = JSON.stringify(
      clean(
        ctx,
        reply.parsed ??
          (reply.stderr || reply.stdout || "agent-browser returned a failure."),
      ),
    );
    throw new Fault(
      reply.timedOut ? "BROWSER_TIMEOUT" : "BROWSER_COMMAND_FAILED",
      "Browser command failed: " + detail,
      "Inspect the browser page and retry; failed steps stay in the run log.",
      1,
      { exitCode: reply.exitCode, results: data },
    );
  }
  return { reply, data };
}
function currentUrl(data: unknown[]): string | undefined {
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    for (const val of [row.result, row.data, row]) {
      if (typeof val === "string" && /^https?:\/\//i.test(val)) return val;
      if (val && typeof val === "object")
        for (const key of ["url", "href"])
          if (typeof (val as Record<string, unknown>)[key] === "string")
            return (val as Record<string, unknown>)[key] as string;
    }
  }
  return undefined;
}
function safeLabel(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "proof"
  );
}
export function browserHelp(): Record<string, unknown> {
  return {
    usage: "spyglass ui [--seat SEAT] <agent-browser command>",
    examples: [
      "spyglass ui open /login",
      "spyglass ui snapshot",
      "spyglass ui login demo",
      "spyglass ui proof dashboard",
      "spyglass ui --seat demo snapshot",
    ],
    operations: [
      "open PATH|URL",
      "read [PATH|URL]",
      "snapshot [-i|-c|--delta|--full]",
      "proof LABEL",
      "login SEAT",
      "click|dblclick|type|fill|press|keyboard|hover|focus|check|uncheck|select|drag|scroll|scrollintoview",
      "wait|back|forward|reload",
      "get text|html|title|url|attr|count|box|styles",
      "is visible|enabled|checked",
      "find",
      "screenshot PATH",
      "tab list|new|switch|close",
      "window new",
      "set viewport|device|offline|media",
      "vitals [URL]",
      "a11y [URL]",
      "pushstate PATH",
      "diff snapshot|url",
      "console",
      "errors",
      "network requests",
      "session info",
    ],
    policy: [
      "Each run and seat gets a new headless browser session.",
      "Spyglass uses an explicit config and allowed run origins.",
      "Page output is marked as untrusted content.",
      "Use spyglass down to close run-owned sessions.",
      "A seat browser left idle for browser.idleTimeoutMs (default 1 hour) shuts down; the next ui command reports BROWSER_EXPIRED.",
    ],
    limits: [
      "No CDP, profiles, saved state, auth vault, raw eval, cookie/storage reads, network changes, file uploads/downloads or paths outside run evidence.",
      "No custom Authorization headers.",
      "wait accepts a selector, --text, --url or --load. --fn runs page JavaScript, --download saves outside evidence, and agent-browser reads wait --state as a saved-state file; all three are refused.",
      "A run-owned loopback proxy enforces exact scheme, host and port on browser traffic; agent-browser also checks allowed hosts.",
    ],
  };
}
async function captureFailure(
  ctx: Context,
  id: Identity,
  domains: string[],
  seat: string,
  cause: unknown,
): Promise<Record<string, unknown>[]> {
  const image = proofPath(ctx, "login-failure");
  const clear =
    'document.querySelectorAll("input,textarea").forEach((element)=>{element.value="";element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}));});';
  try {
    const result = await run(
      ctx,
      id,
      domains.join(","),
      [
        ["eval", clear],
        ["get", "url"],
        ["get", "title"],
        ["snapshot", "-i", "-c", "--delta"],
        ["screenshot", image],
        ["console", "--clear"],
        ["errors", "--clear"],
      ],
      30000,
    );
    const picture = imageArtifact(ctx, image, "login-failure.png");
    const snapshot = result.data.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).command === "snapshot",
    );
    return [
      picture,
      ctx.artifact(
        "login-failure-snapshot.json",
        snapshot ?? result.data,
        "page-snapshot",
      ) as unknown as Record<string, unknown>,
      ctx.artifact(
        "login-failure-page.json",
        {
          pageContent: true,
          seat,
          cause:
            cause instanceof Error
              ? redactText(ctx, cause.message)
              : "Login failed.",
          results: clean(ctx, result.data),
        },
        "page-content",
      ) as unknown as Record<string, unknown>,
    ];
  } catch (error) {
    rmSync(image, { force: true });
    return [
      ctx.artifact(
        "login-failure-capture-error.json",
        {
          pageContent: true,
          seat,
          captureFailure:
            error instanceof Error
              ? redactText(ctx, error.message)
              : "Capture failed.",
        },
        "page-content",
      ) as unknown as Record<string, unknown>,
    ];
  }
}
async function login(
  ctx: Context,
  seat: string,
  id: Identity,
  domains: string[],
): Promise<Record<string, unknown>> {
  const definition = ctx.run.profile.seats[seat]?.login;
  if (!definition)
    throw new Fault(
      "SEAT_LOGIN_MISSING",
      "Seat " + seat + " has no browser login steps.",
      "Add seats." +
        seat +
        ".login.path, steps and done.urlContains to spyglass.json.",
    );
  const loginUrl = checkUrl(ctx, definition.path, ctx.run.web);
  const commands: Command[] = [["open", loginUrl]];
  if (definition.ready) commands.push(["wait", definition.ready.selector]);
  for (const step of definition.steps) {
    if ("fill" in step) {
      let value = step.value ?? "";
      if (step.secret) value = ctx.vault.resolve(step.secret);
      if (value.length >= 4) ctx.vault.register(value);
      commands.push(
        "label" in step.fill
          ? ["find", "label", step.fill.label, "fill", value]
          : [
              "find",
              "role",
              step.fill.role,
              "fill",
              value,
              "--name",
              step.fill.name,
            ],
      );
    } else
      commands.push([
        "find",
        "role",
        step.click.role,
        "click",
        "--name",
        step.click.name,
      ]);
  }
  const expected = definition.done.urlContains;
  commands.push([
    "wait",
    "--url",
    expected.includes("*") ? expected : "**" + expected + "**",
  ]);
  try {
    const result = await run(ctx, id, domains.join(","), commands, 60000);
    const final = await run(
      ctx,
      id,
      domains.join(","),
      [
        ["get", "url"],
        ["get", "title"],
        ["snapshot", "-i", "-c", "--delta"],
      ],
      30000,
    );
    const url = currentUrl(final.data);
    if (!url || !url.includes(expected.replaceAll("*", "")))
      throw new Fault(
        "BROWSER_LOGIN_FAILED",
        "The browser did not reach the configured post-login address.",
        "Check the seat steps and done.urlContains value.",
      );
    ctx.run.activeSeat = seat;
    saveRun(ctx.run);
    return {
      seat,
      loggedIn: true,
      url: redactText(ctx, url),
      pageContent: true,
      results: clean(ctx, result.data.concat(final.data)),
      session: {
        namespace: id.namespace,
        name: id.session,
        isolatedSeat: seat,
      },
    };
  } catch (error) {
    const artifacts = await captureFailure(ctx, id, domains, seat, error);
    if (error instanceof Fault) {
      error.data = { ...error.data, seat, pageContent: true, artifacts };
      throw error;
    }
    throw new Fault(
      "BROWSER_LOGIN_FAILED",
      "Login failed for seat " + seat + ".",
      "Inspect the retained failure screenshot and snapshot, then correct the seat steps.",
      1,
      { seat, artifacts },
    );
  }
}
function selectedSeat(
  args: string[],
  ctx: Context,
): { seat: string; args: string[] } {
  let seat = ctx.run.activeSeat || "default";
  const rest = [...args];
  while (rest[0] === "--seat") {
    const value = rest[1];
    if (!value)
      throw new Fault(
        "BROWSER_SEAT",
        "Missing seat after --seat.",
        "Use spyglass ui --seat <seat> snapshot.",
      );
    rest.splice(0, 2);
    seat = value;
  }
  if (seat !== "default" && !ctx.run.profile.seats[seat])
    throw new Fault(
      "UNKNOWN_SEAT",
      "Unknown browser seat " + seat + ".",
      "Choose a seat from spyglass.json.",
    );
  return { seat, args: rest };
}
async function proof(
  ctx: Context,
  seat: string,
  id: Identity,
  domains: string[],
  label: string,
): Promise<Record<string, unknown>> {
  const name = safeLabel(label),
    image = proofPath(ctx, "proof-" + name);
  try {
    const result = await run(ctx, id, domains.join(","), [
      ["snapshot", "-i", "-c", "--delta"],
      ["get", "url"],
      ["get", "title"],
      ["console", "--clear"],
      ["errors", "--clear"],
      ["network", "requests", "--clear"],
      ["screenshot", image],
    ]);
    const picture = imageArtifact(ctx, image, "proof-" + name + ".png");
    const snapshot = result.data.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).command === "snapshot",
    );
    const snapshotArtifact = ctx.artifact(
      "proof-" + name + "-snapshot.json",
      snapshot ?? result.data,
      "page-snapshot",
    );
    const details = ctx.artifact(
      "proof-" + name + "-details.json",
      {
        label: name,
        seat,
        step: ctx.step.id,
        pageContent: true,
        results: clean(ctx, result.data),
      },
      "page-content",
    );
    return {
      label: name,
      seat,
      pageContent: true,
      results: clean(ctx, result.data),
      artifacts: [picture, snapshotArtifact, details],
    };
  } catch (error) {
    rmSync(image, { force: true });
    if (error instanceof Fault) throw error;
    throw new Fault(
      "BROWSER_PROOF_FAILED",
      "Cannot capture browser proof.",
      "Inspect the browser session and retry.",
      1,
      { pageContent: true, error: redactText(ctx, String(error)) },
    );
  }
}
async function screenshot(
  ctx: Context,
  seat: string,
  id: Identity,
  domains: string[],
  args: string[],
): Promise<Record<string, unknown>> {
  const positionals = args
    .map((value, index) => ({ value, index }))
    .filter((item) => !item.value.startsWith("-"));
  const target = proofPath(ctx, "screenshot");
  const label = positionals.length
    ? basename(positionals.at(-1)!.value)
    : "screenshot.png";
  const command = ["screenshot", ...args],
    indices = command
      .slice(1)
      .map((value, index) => ({ value, index: index + 1 }))
      .filter((x) => !x.value.startsWith("-"));
  if (indices.length) command[indices.at(-1)!.index] = target;
  else command.push(target);
  try {
    const result = await run(ctx, id, domains.join(","), [command]);
    if (!existsSync(target))
      throw new Fault(
        "BROWSER_ARTIFACT_MISSING",
        "agent-browser did not create a screenshot.",
        "Inspect the browser output and retry.",
      );
    const artifact = ctx.importArtifact(target);
    return {
      seat,
      pageContent: true,
      label,
      screenshot: artifact,
      results: result.data,
    };
  } finally {
    rmSync(target, { force: true });
  }
}
export async function browser(
  ctx: Context,
  args: string[],
): Promise<Record<string, unknown>> {
  ctx.step.args = ctx.step.args.map((value) => redactText(ctx, value));
  if (!args.length || args[0] === "--help" || args[0] === "help")
    return browserHelp();
  const picked = selectedSeat(args, ctx),
    seat = picked.seat,
    action = picked.args;
  if (!action.length) return browserHelp();
  const policy = origins(ctx),
    id = identity(ctx, seat);
  await expireIdleBrowsers(
    ctx,
    action[0] === "login" && action[1] ? action[1] : seat,
    policy.domains,
  );
  const startedProxy = await ensureBrowserProxy(
    ctx.run,
    policy.exact,
    idleTimeoutMs(ctx),
  );
  try {
    if (action[0] === "login") {
      const name = action[1];
      if (!name)
        throw new Fault(
          "BROWSER_SEAT",
          "Missing seat after login.",
          "Use spyglass ui login <seat>.",
        );
      if (!ctx.run.profile.seats[name])
        throw new Fault(
          "UNKNOWN_SEAT",
          "Unknown browser seat " + name + ".",
          "Choose a seat from spyglass.json.",
        );
      const loginId = identity(ctx, name),
        fresh = await ensure(ctx, loginId, policy.domains);
      if (fresh) {
        ctx.run.sessions[name] = loginId.session;
        saveRun(ctx.run);
      }
      return login(ctx, name, loginId, [...policy.domains.split(",")]);
    }
    if (action[0] === "proof") {
      if (!action[1])
        throw new Fault(
          "BROWSER_LABEL",
          "Missing proof label.",
          "Use spyglass ui proof <label>.",
        );
      const fresh = await ensure(ctx, id, policy.domains);
      if (fresh) {
        ctx.run.sessions[seat] = id.session;
        saveRun(ctx.run);
      }
      return proof(ctx, seat, id, [...policy.domains.split(",")], action[1]);
    }
    let input = [...action];
    if (input[0] === "open") {
      if (!input[1])
        throw new Fault(
          "BROWSER_URL",
          "Missing page path or URL.",
          "Use spyglass ui open /path.",
        );
      input[1] = checkUrl(ctx, input[1], ctx.run.web);
    }
    const commands = flatten(input).map((command) => validate(ctx, command));
    if (commands.length === 1 && commands[0]![0] === "snapshot") {
      const command = commands[0]!;
      if (!command.some((value) => value === "-i" || value === "--interactive"))
        command.push("-i");
      if (!command.some((value) => value === "-c" || value === "--compact"))
        command.push("-c");
      if (!command.includes("--delta") && !command.includes("--full"))
        command.push("--delta");
    }
    if (commands.length === 1 && commands[0]![0] === "screenshot") {
      const fresh = await ensure(ctx, id, policy.domains);
      if (fresh) {
        ctx.run.sessions[seat] = id.session;
        saveRun(ctx.run);
      }
      return screenshot(
        ctx,
        seat,
        id,
        [...policy.domains.split(",")],
        commands[0]!.slice(1),
      );
    }
    const mayNavigate = new Set([
      "open",
      "click",
      "dblclick",
      "press",
      "keyboard",
      "find",
      "back",
      "forward",
      "reload",
      "tab",
      "pushstate",
    ]);
    if (
      commands.some((command) => mayNavigate.has(command[0] ?? "")) &&
      commands.at(-1)?.[0] !== "get"
    )
      commands.push(["get", "url"]);
    const fresh = await ensure(ctx, id, policy.domains);
    if (fresh) {
      ctx.run.sessions[seat] = id.session;
      saveRun(ctx.run);
    }
    const result = await run(ctx, id, policy.domains, commands);
    const url = currentUrl(result.data);
    if (url) checkUrl(ctx, url);
    ctx.run.activeSeat = seat;
    saveRun(ctx.run);
    return {
      seat,
      pageContent: true,
      currentUrl: url ? redactText(ctx, url) : undefined,
      results: clean(ctx, result.data),
      session: {
        namespace: id.namespace,
        name: id.session,
        isolatedSeat: seat,
      },
    };
  } catch (error) {
    if (startedProxy && !Object.keys(ctx.run.sessions).length)
      await stopBrowserProxy(ctx.run).catch(() => undefined);
    throw error;
  }
}
export async function browserDoctor(
  ctx: Context,
): Promise<Record<string, unknown>> {
  const saved = ctx.run.browserProxy;
  const entries = Object.entries(ctx.run.sessions);
  if (!saved && !entries.length)
    return { browser: { proxy: { available: false }, sessions: [] } };
  const policy = origins(ctx);
  if (entries.length && !saved)
    throw new Fault(
      "BROWSER_PROXY_STATE",
      "The run has browser sessions but no owned exact-origin proxy record.",
      "Run spyglass down; create a new run before using browser verification.",
      3,
    );
  if (saved) {
    const expected = [...policy.exact].sort();
    if (JSON.stringify([...saved.origins].sort()) !== JSON.stringify(expected))
      throw new Fault(
        "BROWSER_PROXY_POLICY",
        "The saved browser proxy origins do not match the current run policy.",
        "Run spyglass down and create a new run with the required browser origins.",
        3,
      );
  }
  const proxyLive = !saved || (await browserProxyLive(ctx.run));
  if (saved && proxyLive) await browserProxyEvents(ctx.run, saved.sequence);
  const sessions: Record<string, unknown>[] = [];
  for (const [seat, recorded] of entries) {
    const id = identity(ctx, seat);
    if (recorded !== id.session)
      throw new Fault(
        "BROWSER_OWNERSHIP",
        "The recorded browser session does not match this run and seat.",
        "Inspect run state; Spyglass will not attach to a foreign browser.",
        3,
        { seat },
      );
    const stale = mayHaveExpired(ctx, seat);
    const meta = await inspect(ctx, id, policy.domains);
    if (meta.namespace !== id.namespace || meta.session !== id.session)
      throw new Fault(
        "BROWSER_OWNERSHIP",
        "Session metadata does not match the run that owns this browser.",
        "Inspect the browser session and retained run state.",
        3,
        { seat },
      );
    if (meta.active !== true && (!proxyLive || stale)) {
      sessions.push({ seat, active: false, expired: true, next: EXPIRED_NEXT });
      continue;
    }
    if (meta.active !== true)
      throw new Fault(
        "BROWSER_SESSION_UNAVAILABLE",
        "A recorded browser session is not active for seat " + seat + ".",
        "Run spyglass down, then open the browser again in a new verification step.",
        3,
        { seat },
      );
    sessions.push({
      seat,
      namespace: id.namespace,
      session: id.session,
      active: true,
    });
  }
  // A live browser needs its proxy: report the proxy failure.
  if (saved && !proxyLive && sessions.some((session) => session.active))
    await browserProxyEvents(ctx.run, saved.sequence);
  return {
    browser: {
      proxy: {
        available: Boolean(saved),
        healthy: Boolean(saved) && proxyLive,
        originCount: saved?.origins.length ?? 0,
      },
      sessions,
    },
  };
}
export async function closeBrowsers(ctx: Context): Promise<void> {
  if (!Object.keys(ctx.run.sessions).length) {
    if (ctx.run.browserProxy) await stopBrowserProxy(ctx.run);
    return;
  }
  const policy = origins(ctx);
  for (const [seat, recorded] of Object.entries(ctx.run.sessions)) {
    const id = identity(ctx, seat);
    if (recorded !== id.session)
      throw new Fault(
        "BROWSER_OWNERSHIP",
        "The recorded browser session does not match its run and seat.",
        "Inspect run state before cleanup; Spyglass will not close a foreign session.",
        3,
      );
    const meta = await inspect(ctx, id, policy.domains);
    if (meta.namespace !== id.namespace || meta.session !== id.session)
      throw new Fault(
        "BROWSER_OWNERSHIP",
        "Session metadata does not match the run that owns cleanup.",
        "Inspect the browser session before retrying down.",
        3,
      );
    if (meta.active) {
      const config = configFile(ctx),
        result = await ctx.execute(
          [
            "agent-browser",
            ...globalArgs(
              config,
              id,
              policy.domains,
              idleTimeoutMs(ctx),
              ctx.run.browserProxy?.port,
            ),
            "close",
          ],
          {
            env: browserEnv(config, id, policy.domains, idleTimeoutMs(ctx)),
            timeoutMs: 30000,
          },
        );
      if (result.exitCode !== 0)
        throw new Fault(
          "BROWSER_CLEANUP_FAILED",
          "Cannot close the run-owned browser: " +
            redactText(ctx, result.stderr || result.stdout),
          "Inspect the run browser session and retry spyglass down.",
          3,
        );
      // `close` returns while the daemon is still shutting down.
      const end = Date.now() + 5_000;
      while ((await inspect(ctx, id, policy.domains)).active) {
        if (Date.now() >= end)
          throw new Fault(
            "BROWSER_CLEANUP_FAILED",
            "The run-owned browser is still active after close.",
            "Inspect the run browser session and retry spyglass down.",
            3,
          );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    delete ctx.run.sessions[seat];
    if (ctx.run.activeSeat === seat) ctx.run.activeSeat = "default";
    saveRun(ctx.run);
  }
  if (ctx.run.browserProxy) await stopBrowserProxy(ctx.run);
}
