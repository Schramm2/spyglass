// Spyglass landing page behaviour. Every piece works without this script:
// the HTML already shows a complete, passing state.

// Reveal each part once as it enters the viewport, staggered inside a section.
(() => {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-in"));
    return;
  }
  document.querySelectorAll("section").forEach((section) => {
    section.querySelectorAll("[data-reveal]").forEach((el, index) => {
      el.style.setProperty("--d", Math.min(index, 5));
    });
  });
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
  );
  targets.forEach((el) => io.observe(el));
  // Show anything still hidden if the observer never fired.
  window.addEventListener("load", () =>
    setTimeout(() => {
      targets.forEach((el) => {
        const box = el.getBoundingClientRect();
        if (box.top < innerHeight && box.bottom > 0) el.classList.add("is-in");
      });
    }, 2500),
  );
})();

// The hidden starting states in styles.css apply only under html.js. Set it
// only after the observer that shows the content again is in place.
document.documentElement.classList.add("js");

// Hero: hash the retained screenshot in this browser and compare it with the
// checksum that the run log recorded. "Change one byte" flips a byte of a
// copy of the download, so the visitor sees the integrity check fail.
(() => {
  const card = document.querySelector(".integrity");
  const img = document.getElementById("artifact-img");
  const now = document.getElementById("hash-now");
  const verdict = document.getElementById("verdict");
  const tamper = document.getElementById("tamper");
  if (!card) return;
  if (!globalThis.crypto?.subtle) {
    now.textContent = "This browser cannot hash files on this connection.";
    return;
  }
  const recorded = document.getElementById("hash-recorded").textContent.trim();

  let original;
  let tampered = false;
  let latest = 0; // only the newest hash may update the card

  const hex = (buffer) =>
    [...new Uint8Array(buffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  async function show() {
    const request = ++latest;
    const bytes = new Uint8Array(original).slice();
    if (tampered) bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
    if (request !== latest) return;
    const match = digest === recorded;
    const code = document.createElement("code");
    code.className = `hash ${match ? "is-match" : "is-mismatch"}`;
    code.textContent = digest;
    now.replaceChildren(code);
    card.classList.toggle("is-tampered", !match);
    verdict.classList.toggle("is-fail", !match);
    // The mismatch line uses the report's own message for a changed artifact.
    verdict.textContent = match
      ? "The file matches the checksum in the run log."
      : "Artifact checksum changed: 5006265f-e3c-1-proof-home.png.";
    tamper.textContent = tampered ? "Restore the file" : "Change one byte";
  }

  const fail = () => {
    now.textContent = "Serve this page over HTTP to hash the file.";
  };

  fetch(img.currentSrc || img.src)
    .then((response) =>
      response.ok ? response.arrayBuffer() : Promise.reject(),
    )
    .then((buffer) => {
      original = buffer;
      tamper.hidden = false;
      return show();
    })
    .catch(fail);

  tamper.addEventListener("click", () => {
    tampered = !tampered;
    show().catch(fail);
  });
})();

// Copy buttons on each command panel.
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const code = button.parentElement.querySelector("code").textContent;
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select it";
    }
    setTimeout(() => (button.textContent = "Copy"), 1600);
  });
});

// Showcase: show the recorded CLI output for the selected run state.
(() => {
  const states = window.SPYGLASS_REPORT_STATES;
  const form = document.getElementById("rs-controls");
  if (!states || !form) return;
  const command = document.getElementById("rs-command");
  const status = document.getElementById("rs-status");
  const exit = document.getElementById("rs-exit");
  const body = document.getElementById("rs-body");

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function group(title, children) {
    const wrap = el("div", "rs-group");
    wrap.append(el("h3", "", title), children);
    return wrap;
  }

  function findingsList(findings) {
    const list = el("ul", "findings");
    for (const finding of findings) {
      const item = el("li");
      item.append(
        el("code", "", finding.code),
        el("span", "", finding.message),
      );
      list.append(item);
    }
    return list;
  }

  function claimDetails(claim) {
    const list = el("dl", "mr-claim");
    const rows = [
      ["Outcome", claim.outcome],
      ["Observed", claim.observed || "Not recorded."],
      ["Steps", claim.steps.join(", ") || "None cited."],
      ["Evidence", claim.artifacts.join(", ") || "None cited."],
    ];
    for (const [term, value] of rows) {
      const row = el("div");
      row.append(el("dt", "", term), el("dd", "", value));
      list.append(row);
    }
    return list;
  }

  function environmentList(environment) {
    const list = el("ul", "mr-env");
    for (const check of environment) {
      const item = el("li");
      const tone =
        check.status === "passed"
          ? "dot-pass"
          : check.status === "failed"
            ? "dot-fail"
            : "dot-pending";
      item.append(
        el("span", `dot ${tone}`),
        document.createTextNode(`${check.name}: ${check.detail}`),
      );
      list.append(item);
    }
    return list;
  }

  function render() {
    const data = new FormData(form);
    const state =
      states[
        `${data.get("result")}|${data.get("source")}|${data.get("cleanup")}`
      ];
    if (!state) return;
    const passed = state.status === "passed";
    command.textContent =
      state.command === "result"
        ? "spyglass result --run terminal-trial --file result.json"
        : "spyglass report --run terminal-trial";
    status.textContent =
      state.command === "result" ? state.error.code : state.status;
    status.className = `pill ${passed ? "" : "pill-fail"}`;
    exit.textContent = `exit ${state.exit}`;

    body.replaceChildren();
    if (state.command === "result") {
      body.append(
        group("Result refused", findingsList(state.findings)),
        el("p", "rs-next", `Next: ${state.error.next}`),
      );
    } else {
      body.append(group(`Claim ${state.claim.id}`, claimDetails(state.claim)));
      if (state.findings.length)
        body.append(group("Findings", findingsList(state.findings)));
      body.append(group("Environment", environmentList(state.environment)));
    }
    body.classList.remove("is-swapping");
    void body.offsetWidth;
    body.classList.add("is-swapping");
  }

  form.addEventListener("change", render);
  render();
})();
