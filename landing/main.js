// Spyglass landing page behaviour: copy buttons, the GitHub star count and
// the "Break a run" simulation. The page reads correctly without this script.

const REPO_API = "https://api.github.com/repos/Schramm2/spyglass";

// The output lines below are the CLI's own messages from src/. Only the
// RUN_BUSY lock path is shortened.
const FAULTS = {
  stale: {
    exit: 1,
    reason:
      "Evidence gathered after the edit cannot prove the source the run started on.",
    lines: [
      ["prompt gap", "$ spyglass check health --run landing-demo"],
      [
        "err",
        "STALE_SOURCE: Source changed since up: fixtures/demo-app/server.mjs.",
      ],
      [
        "dim",
        "Next: Rebuild through the owner and create a new run; keep the earlier evidence.",
      ],
    ],
  },
  assert: {
    exit: 1,
    reason: "health-ready has no passing step; a zero exit is not enough.",
    lines: [
      ["prompt gap", "$ spyglass check deliberate-failure --run landing-demo"],
      [
        "err",
        "CHECK_FAILED: Check deliberate-failure failed: one or more assertions failed; the structured result reports failure.",
      ],
      ["dim", "exitCode: 0"],
      ["err", "overall: false"],
    ],
  },
  origin: {
    exit: 1,
    reason:
      "The browser step failed on a blocked origin, so it cannot be cited.",
    lines: [
      [
        "prompt gap",
        "$ spyglass ui open https://example.com --run landing-demo",
      ],
      [
        "err",
        "BROWSER_ORIGIN_BLOCKED: Blocked browser origin https://example.com.",
      ],
      [
        "dim",
        "Next: Use the run web address or add this exact origin to browser.allowedOrigins.",
      ],
    ],
  },
  write: {
    exit: 1,
    lines: [
      ["prompt gap", "$ spyglass db 'delete from jobs' --run landing-demo"],
      ["err", "DATABASE_READ_ONLY: Spyglass accepts read-only SQL only."],
      [
        "dim",
        "Next: Use SELECT, WITH, VALUES, TABLE, SHOW or EXPLAIN. The query was not sent.",
      ],
    ],
  },
  busy: {
    exit: 3,
    lines: [
      ["prompt gap", "$ spyglass check health --run landing-demo"],
      ["err", "RUN_BUSY: Run landing-demo is busy. Lock: …"],
      [
        "dim",
        "Next: Inspect spyglass status --run landing-demo. Wait for the active command; do not bypass its lock.",
      ],
    ],
  },
};
const FAULT_ORDER = ["stale", "assert", "origin", "write", "busy"];

function setupCopy() {
  for (const button of document.querySelectorAll("[data-copy]")) {
    let timer;
    button.addEventListener("click", async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        ok = true;
      } catch {
        ok = false;
      }
      button.textContent = ok ? "Copied" : "Select it";
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = "Copy";
      }, 2000);
    });
  }
}

async function setupStars() {
  const targets = document.querySelectorAll("[data-stars]");
  if (!targets.length) return;
  let stars = null;
  try {
    const cached = sessionStorage.getItem("spyglass-stars");
    if (cached !== null) stars = Number(cached);
  } catch {
    // Storage can be unavailable; fetch instead.
  }
  if (stars === null) {
    try {
      const response = await fetch(REPO_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) return;
      const body = await response.json();
      stars = Number(body.stargazers_count);
      try {
        sessionStorage.setItem("spyglass-stars", String(stars));
      } catch {
        // Ignore storage failures.
      }
    } catch {
      return;
    }
  }
  if (!Number.isFinite(stars) || stars <= 0) return;
  const label = stars.toLocaleString("en-US");
  for (const target of targets) {
    target.textContent = label;
    target.setAttribute("aria-label", `${label} stars`);
    target.hidden = false;
  }
}

function setupSimulation() {
  const panel = document.querySelector("[data-sim]");
  if (!panel) return;
  const term = panel.querySelector("[data-term]");
  const verdict = panel.querySelector("[data-verdict]");
  const reasonsBox = panel.querySelector("[data-reasons]");
  const exitBox = panel.querySelector("[data-exit]");
  const faultButtons = [...panel.querySelectorAll("[data-fault]")];
  const opButtons = [...panel.querySelectorAll("[data-op]")];
  const reset = panel.querySelector("[data-reset]");
  const state = { faults: new Set(), result: false, cleanup: false };
  let previous = new Set();

  const line = (cls, text, fresh) => {
    const div = document.createElement("div");
    div.className = `tl ${cls}${fresh ? " fresh" : ""}`;
    div.textContent = text;
    return div;
  };

  function render() {
    const lines = [
      [
        "prompt",
        "$ spyglass up --run landing-demo --plan verification-plan.json",
      ],
      ["plain", "state: ready"],
      ["plain", "sourceChanges: none"],
    ];
    const reasons = [];
    for (const id of FAULT_ORDER) {
      if (!state.faults.has(id)) continue;
      const fault = FAULTS[id];
      lines.push(...fault.lines, ["dim", `(exit status ${fault.exit})`]);
      if (fault.reason) reasons.push(fault.reason);
    }
    if (!state.faults.has("stale") && !state.faults.has("assert")) {
      lines.push(
        ["prompt gap", "$ spyglass check health --run landing-demo"],
        ["plain", "attempt: d1eb89c8-c97"],
        ["ok", "overall: true"],
      );
    }
    if (state.cleanup) {
      lines.push(
        ["prompt gap", "$ spyglass down --run landing-demo"],
        ["plain", "state: stopped"],
      );
    }
    if (!state.result)
      reasons.push("No result has been recorded for this run.");
    if (!state.cleanup)
      reasons.push("Cleanup has not run; the demo app is still up.");
    const complete = reasons.length === 0;
    // The verdict box shows `spyglass report`: 0 when complete, 1 otherwise.
    const exit = complete ? 0 : 1;

    const keys = lines.map((entry) => entry.join("|"));
    term.replaceChildren(
      ...lines.map((entry, i) =>
        line(entry[0], entry[1], !previous.has(keys[i])),
      ),
    );
    previous = new Set(keys);

    verdict.textContent = complete ? "Complete" : "Incomplete";
    verdict.classList.toggle("is-complete", complete);
    exitBox.textContent = String(exit);
    const rows = complete
      ? [
          reasonRow(
            "Every required claim has a completed step and its evidence. Cleanup is done.",
            true,
          ),
        ]
      : reasons.map((text) => reasonRow(text, false));
    reasonsBox.replaceChildren(...rows);

    for (const button of faultButtons) {
      button.setAttribute(
        "aria-checked",
        String(state.faults.has(button.dataset.fault)),
      );
    }
    for (const button of opButtons) {
      button.setAttribute("aria-checked", String(state[button.dataset.op]));
    }
  }

  function reasonRow(text, good) {
    const row = document.createElement("div");
    row.className = `reason fresh${good ? " is-good" : ""}`;
    if (!good) {
      const mark = document.createElement("span");
      mark.className = "mk";
      mark.setAttribute("aria-hidden", "true");
      row.append(mark);
    }
    const span = document.createElement("span");
    span.textContent = text;
    row.append(span);
    return row;
  }

  for (const button of faultButtons) {
    button.disabled = false;
    button.addEventListener("click", () => {
      const id = button.dataset.fault;
      if (state.faults.has(id)) state.faults.delete(id);
      else state.faults.add(id);
      render();
    });
  }
  for (const button of opButtons) {
    button.disabled = false;
    button.addEventListener("click", () => {
      const key = button.dataset.op;
      state[key] = !state[key];
      render();
    });
  }
  reset.disabled = false;
  reset.addEventListener("click", () => {
    state.faults.clear();
    state.result = false;
    state.cleanup = false;
    render();
  });

  previous = new Set();
  render();
  for (const node of term.querySelectorAll(".fresh"))
    node.classList.remove("fresh");
  for (const node of reasonsBox.querySelectorAll(".fresh"))
    node.classList.remove("fresh");
}

setupCopy();
setupSimulation();
setupStars();
