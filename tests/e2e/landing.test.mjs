import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { once } from "node:events";
import { test } from "node:test";

// Opt-in real-browser checks for the static page, not the CLI surface suite.
// No browser library or test framework is added to the package.
const enabled = process.env.SPYGLASS_TEST_LANDING === "1";
const run = promisify(execFile);

test(
  "landing page journeys",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const session = `landing-e2e-${process.pid}`;
    const artifacts = resolve(
      process.env.SPYGLASS_LANDING_ARTIFACTS || ".spyglass/landing-e2e",
    );
    await mkdir(artifacts, { recursive: true });
    const server = createServer(async (request, response) => {
      const name = new URL(request.url, "http://localhost").pathname;
      const files = {
        "/": "index.html",
        "/styles.css": "styles.css",
        "/main.js": "main.js",
        "/favicon.png": "favicon.png",
      };
      if (!files[name]) {
        response.writeHead(404).end();
        return;
      }
      const types = {
        "/": "text/html",
        "/styles.css": "text/css",
        "/main.js": "text/javascript",
        "/favicon.png": "image/png",
      };
      response.setHeader("Content-Type", types[name]);
      response.end(
        await readFile(
          new URL(`../../landing/${files[name]}`, import.meta.url),
        ),
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${server.address().port}/`;
    let ws;
    const observations = [];
    try {
      await run("agent-browser", ["--session", session, "open", url]);
      const { stdout } = await run("agent-browser", [
        "--session",
        session,
        "get",
        "cdp-url",
      ]);
      const endpoint = new URL(stdout.trim());
      const targets = await (
        await fetch(`http://${endpoint.host}/json/list`)
      ).json();
      ws = new WebSocket(
        targets.find((target) => target.type === "page").webSocketDebuggerUrl,
      );
      await once(ws, "open");
      let id = 0;
      const pending = new Map();
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error)
          request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      });
      const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const requestId = ++id;
          pending.set(requestId, { resolve, reject });
          ws.send(JSON.stringify({ id: requestId, method, params }));
        });
      const evaluate = async (expression) => {
        const { result, exceptionDetails } = await send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        assert.equal(
          exceptionDetails,
          undefined,
          JSON.stringify(exceptionDetails),
        );
        return result.value;
      };
      const reload = async () => {
        const loaded = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.removeEventListener("message", listener);
            reject(new Error("Page load timed out"));
          }, 10000);
          const listener = (event) => {
            if (JSON.parse(event.data).method !== "Page.loadEventFired") return;
            clearTimeout(timer);
            ws.removeEventListener("message", listener);
            resolve();
          };
          ws.addEventListener("message", listener);
        });
        await send("Page.reload");
        await loaded;
      };
      const screenshot = async (
        name,
        scriptsEnabled = true,
        fullPage = false,
      ) => {
        if (scriptsEnabled)
          await evaluate(
            "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
          );
        const clip = fullPage
          ? (await send("Page.getLayoutMetrics")).cssContentSize
          : undefined;
        const { data } = await send("Page.captureScreenshot", {
          format: "png",
          ...(clip
            ? { captureBeyondViewport: true, clip: { ...clip, scale: 1 } }
            : {}),
        });
        await writeFile(
          resolve(artifacts, `${name}.png`),
          Buffer.from(data, "base64"),
        );
      };
      await send("Page.enable");
      await send("Network.enable");
      // Exercise the documented failed-request path; fonts use the local fallback.
      await send("Network.setBlockedURLs", { urls: ["https://*"] });
      await send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      await reload();

      await t.test(
        "quickstart and full commands remain visible at narrow and wide widths",
        async () => {
          for (const width of [1440, 1024, 760, 390, 320]) {
            await send("Emulation.setDeviceMetricsOverride", {
              width,
              height: 900,
              deviceScaleFactor: 1,
              mobile: false,
            });
            const state = await evaluate(`(() => {
          const lead = document.querySelector(".statement");
          const action = lead.querySelector('a[href*="quickstart"]');
          const command = lead.querySelector("code");
          const report = document.querySelector(".report");
          return { action: !!action, actionVisible: !!action && action.getBoundingClientRect().right <= innerWidth,
            commandFits: command.scrollWidth <= command.clientWidth + 1,
            reportFits: report.scrollHeight <= report.clientHeight + 1,
            folderFits: [...document.querySelectorAll('.rail-l > *')].every(e => e.scrollHeight <= e.clientHeight + 1),
            pageFits: document.documentElement.scrollWidth <= innerWidth };
        })()`);
            observations.push({ width, ...state });
            assert.ok(
              state.action && state.actionVisible,
              `Quickstart must be visible beside the description at ${width}px`,
            );
            assert.ok(
              state.commandFits,
              `The complete install command must wrap at ${width}px`,
            );
            assert.ok(
              state.reportFits,
              `The report preview must not clip text at ${width}px`,
            );
            assert.ok(
              state.folderFits,
              `Folder files and product facts must not be clipped at ${width}px`,
            );
            assert.ok(state.pageFits, `The page must reflow at ${width}px`);
            await evaluate("scrollTo(0, 0)");
            await screenshot(`hero-${width}`);
            if ([1440, 320].includes(width))
              await screenshot(`full-${width}`, true, true);
          }
        },
      );

      await t.test(
        "every section remains readable with doubled body text",
        async () => {
          for (const width of [1440, 320]) {
            await send("Emulation.setDeviceMetricsOverride", {
              width,
              height: 900,
              deviceScaleFactor: 1,
              mobile: false,
            });
            // Text-only resize proxy. Branding and the aria-hidden signature are not task text.
            await evaluate(`(() => {
            const entries = [...document.querySelectorAll('body *')].filter(e => e instanceof HTMLElement && !e.closest('.band, .blocks, .marquee'))
              .map(e => [e, parseFloat(getComputedStyle(e).fontSize)]);
            for (const [element, size] of entries) element.style.fontSize = (size * 2) + 'px';
          })()`);
            assert.ok(
              await evaluate(
                "document.documentElement.scrollWidth <= innerWidth",
              ),
              `Doubled task text must reflow at ${width}px`,
            );
            const sections = await evaluate(
              "document.querySelectorAll('main > section').length",
            );
            for (let index = 0; index < sections; index++) {
              await evaluate(
                `document.querySelectorAll('main > section')[${index}].scrollIntoView()`,
              );
              await screenshot(`text-200-${width}-section-${index}`);
            }
            await evaluate("document.querySelector('footer').scrollIntoView()");
            await screenshot(`text-200-${width}-footer`);
            await reload();
          }
        },
      );

      await t.test(
        "copy acknowledges completion and selects the command after clipboard refusal",
        async () => {
          await send("Browser.grantPermissions", {
            origin: url,
            permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
          });
          await send("Page.bringToFront");
          await evaluate("document.querySelector('[data-copy]').click()");
          // Read through the actual clipboard after the write completes.
          await evaluate(`new Promise((resolve, reject) => {
            const deadline = Date.now() + 3000;
            function poll() {
              if (!document.querySelector('[data-copy]').disabled) resolve();
              else if (Date.now() > deadline) reject(new Error('Clipboard write timed out'));
              else setTimeout(poll, 10);
            }
            poll();
          })`);
          assert.equal(
            await evaluate("navigator.clipboard.readText()"),
            "npm install --global @mattschramm/spyglass",
          );
          assert.match(
            await evaluate(
              "document.querySelector('.copy-status')?.textContent || ''",
            ),
            /copied/i,
            "Copy success needs a persistent status message",
          );
          await evaluate(
            `Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Permission denied"); } } }); document.querySelector('[data-copy]').click()`,
          );
          const fallback = await evaluate(
            `({ selected: getSelection().toString(), focused: document.activeElement.tagName, message: document.querySelector('.copy-status').textContent })`,
          );
          assert.equal(
            fallback.selected,
            "npm install --global @mattschramm/spyglass",
          );
          assert.equal(fallback.focused, "CODE");
          assert.match(fallback.message, /manually/i);
          await screenshot("copy-refused");
          // The external clipboard can be slow. Do not claim completion early or send duplicate writes.
          await evaluate(
            `Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise(resolve => { window.finishClipboardWrite = resolve; window.clipboardCalls = (window.clipboardCalls || 0) + 1; }) } }); document.querySelector('[data-copy]').click(); document.querySelector('[data-copy]').click()`,
          );
          assert.equal(
            await evaluate("document.querySelector('[data-copy]').disabled"),
            true,
          );
          assert.match(
            await evaluate(
              "document.querySelector('.copy-status').textContent",
            ),
            /copying/i,
          );
          assert.equal(await evaluate("window.clipboardCalls"), 1);
          await evaluate("window.finishClipboardWrite(); Promise.resolve()");
          assert.match(
            await evaluate(
              "document.querySelector('.copy-status').textContent",
            ),
            /copied/i,
          );
        },
      );

      await t.test(
        "simulation covers completion, every fault, recovery and reset without live execution",
        async () => {
          await evaluate(
            `document.querySelector('[data-op="result"]').click(); document.querySelector('[data-op="cleanup"]').click()`,
          );
          assert.equal(
            await evaluate(
              "document.querySelector('[data-verdict]').textContent",
            ),
            "Complete",
          );
          for (const [fault, expected] of [
            ["stale", "Incomplete"],
            ["assert", "Incomplete"],
            ["origin", "Incomplete"],
            ["write", "Complete"],
            ["busy", "Complete"],
          ]) {
            await evaluate(
              `document.querySelector('[data-fault="${fault}"]').click()`,
            );
            assert.equal(
              await evaluate(
                "document.querySelector('[data-verdict]').textContent",
              ),
              expected,
              `${fault}: report status must match the effect on required proof`,
            );
            assert.equal(
              await evaluate(
                `document.querySelector('[data-fault="${fault}"]').getAttribute("aria-checked")`,
              ),
              "true",
            );
            if (expected === "Complete")
              assert.match(
                await evaluate(
                  "document.querySelector('[data-reasons]').textContent",
                ),
                /refused|blocked/i,
                "A refused optional action must explain why the report can stay complete",
              );
            await evaluate(
              `document.querySelector('[data-fault="${fault}"]').click()`,
            );
            assert.equal(
              await evaluate(
                "document.querySelector('[data-verdict]').textContent",
              ),
              "Complete",
            );
          }
          await evaluate("document.querySelector('[data-reset]').click()");
          assert.equal(
            await evaluate(
              "document.querySelector('[data-verdict]').textContent",
            ),
            "Incomplete",
          );
          assert.match(
            await evaluate(
              "document.querySelector('[data-sim-note]').textContent",
            ),
            /simulation/i,
          );
          assert.match(
            await evaluate(
              "document.querySelector('[data-sim-status]').textContent",
            ),
            /incomplete/i,
          );
        },
      );

      await t.test(
        "keyboard switches keep focus and output follows controls on a phone",
        async () => {
          await send("Emulation.setDeviceMetricsOverride", {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true,
          });
          await evaluate(
            "document.querySelector('[data-reset]').click(); document.querySelector('[data-op=\"result\"]').focus()",
          );
          await send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: " ",
            code: "Space",
            windowsVirtualKeyCode: 32,
          });
          await send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: " ",
            code: "Space",
            windowsVirtualKeyCode: 32,
          });
          assert.equal(
            await evaluate(
              "document.activeElement.getAttribute('aria-checked')",
            ),
            "true",
          );
          assert.notEqual(
            await evaluate(
              "getComputedStyle(document.activeElement).outlineStyle",
            ),
            "none",
            "Keyboard focus must be visible",
          );
          const order = await evaluate(
            "document.querySelector('.ctrls').getBoundingClientRect().top < document.querySelector('.out').getBoundingClientRect().top",
          );
          assert.ok(
            order,
            "Mobile users must reach controls before the long output",
          );
          await send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
          });
          assert.equal(
            await evaluate("document.activeElement.dataset.op"),
            "cleanup",
          );
          await screenshot("demo-keyboard");
        },
      );

      await t.test(
        "normal-motion signature does not move without a pause control",
        async () => {
          await send("Emulation.setEmulatedMedia", {
            features: [
              { name: "prefers-reduced-motion", value: "no-preference" },
            ],
          });
          assert.equal(
            await evaluate(
              "getComputedStyle(document.querySelector('.mq-track')).animationName",
            ),
            "none",
          );
          await send("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-reduced-motion", value: "reduce" }],
          });
        },
      );

      await t.test(
        "no JavaScript leaves readable content and no active-looking unavailable controls",
        async () => {
          await send("Emulation.setScriptExecutionDisabled", { value: true });
          await reload();
          const state =
            await evaluate(`({ copyHidden: [...document.querySelectorAll('[data-copy]')].every(e => getComputedStyle(e).display === 'none'),
        disabled: [...document.querySelectorAll('[data-sim] button')].every(e => e.disabled),
        note: document.querySelector('[data-sim-note]')?.textContent,
        starsHidden: [...document.querySelectorAll('[data-stars]')].every(e => e.hidden) })`);
          assert.ok(
            state.copyHidden,
            "Copy controls must not look available without JavaScript",
          );
          assert.ok(
            state.disabled,
            "Simulation controls must stay disabled without JavaScript",
          );
          assert.match(state.note, /JavaScript/);
          assert.ok(
            state.starsHidden,
            "A failed GitHub request must not invent a star count",
          );
          await screenshot("no-javascript", false);
          await send("Emulation.setScriptExecutionDisabled", { value: false });
          await reload();
        },
      );
    } finally {
      await writeFile(
        resolve(artifacts, "observations.json"),
        JSON.stringify(observations, null, 2),
      );
      ws?.close();
      await run("agent-browser", ["--session", session, "close"]).catch(
        () => {},
      );
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
