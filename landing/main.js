// Spyglass landing page behaviour. Every piece works without this script:
// the HTML already shows a complete, passing state, and the hidden starting
// states in styles.css apply only under html.js with motion allowed.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Reveal each part once as it enters the viewport, staggered inside a section.
(() => {
  const targets = document.querySelectorAll(
    "[data-reveal], .menu, .tree, .ftable",
  );
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-in"));
    return;
  }
  document.querySelectorAll("section").forEach((section) => {
    section.querySelectorAll("[data-reveal]").forEach((el, index) => {
      el.style.setProperty("--d", Math.min(index, 5));
    });
  });
  document.querySelectorAll(".menu-item").forEach((el, index) => {
    el.style.setProperty("--d", index);
  });
  document.querySelectorAll(".ftable tbody tr").forEach((row, index) => {
    row.style.transitionDelay = `${index * 60}ms`;
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

// Facts: each figure counts up once when it arrives.
(() => {
  const figures = document.querySelectorAll("[data-count]");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) return;
  const run = (el) => {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    const start = performance.now();
    const duration = 1100;
    const frame = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (target * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        run(entry.target);
      }
    },
    { threshold: 0.6 },
  );
  figures.forEach((el) => io.observe(el));
})();

// The lens. The scroll moves a spyglass lens across the agent's claim; at
// the end the lens opens onto the whole step log. On a fine pointer the
// lens follows the pointer while it is over the claim.
(() => {
  const section = document.getElementById("lens");
  const field = document.getElementById("lens-field");
  if (!section || !field || reduceMotion.matches) return;

  const narrow = matchMedia("(max-width: 900px)");
  let pointer = null;
  let queued = false;

  function progress() {
    const box = section.getBoundingClientRect();
    const travel = box.height - innerHeight;
    return Math.min(1, Math.max(0, -box.top / Math.max(1, travel)));
  }

  function paint() {
    queued = false;
    const p = progress();
    const { width, height } = field.getBoundingClientRect();
    const base = Math.min(width, height) * 0.2 + 20;
    const full = Math.hypot(width, height);
    // 0 → 0.12: the lens arrives; 0.12 → 0.72: it reads along the claim;
    // 0.72 → 1: it opens onto the whole record.
    const arrive = Math.min(1, p / 0.12);
    const read = Math.min(1, Math.max(0, (p - 0.12) / 0.6));
    const open = Math.min(1, Math.max(0, (p - 0.72) / 0.24));
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    let x = width * (0.18 + 0.64 * read);
    let y = height * (0.5 + 0.18 * Math.sin(read * Math.PI * 2));
    if (pointer && open === 0) ({ x, y } = pointer);
    let r = base * ease(arrive) + (full - base) * ease(open);
    // The claim gives way quickly once the lens starts to open.
    let claim = Math.max(0, 1 - open * 5);
    // On a narrow screen the lens does not read along the claim: it grows
    // from the centre while the claim gives way to the record.
    if (narrow.matches) {
      const grow = ease(Math.min(1, Math.max(0, (p - 0.1) / 0.7)));
      x = width / 2;
      y = height / 2;
      r = full * grow;
      claim = Math.max(0, 1 - grow * 2.5);
    }

    field.style.setProperty("--x", `${x}px`);
    field.style.setProperty("--y", `${y}px`);
    field.style.setProperty("--r", `${r}px`);
    field.style.setProperty("--ring", String(narrow.matches ? 0 : 1 - open));
    field.style.setProperty("--claim", String(claim));
    section.classList.toggle(
      "is-open",
      narrow.matches ? claim === 0 : open > 0,
    );
  }

  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };

  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  field.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const box = field.getBoundingClientRect();
    pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
    section.classList.add("is-free");
    queue();
  });
  field.addEventListener("pointerleave", () => {
    pointer = null;
    section.classList.remove("is-free");
    queue();
  });
  paint();
})();

// Hash the retained screenshot in this browser and compare it with the
// checksum that the run log recorded. "Change one byte" flips a byte of a
// copy of the download, so the visitor sees the integrity check fail.
(() => {
  const card = document.getElementById("integrity-card");
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

// Run: the step nearest the middle of the screen is active, and the held
// terminal shows that step's recorded output.
(() => {
  const steps = [...document.querySelectorAll(".run-step")];
  const screens = [...document.querySelectorAll(".term-screen")];
  // The drawing's tubes end at about 28% and 55% of its width.
  const scope = document.querySelector(".run-scope img");
  if (!steps.length || !("IntersectionObserver" in window)) return;
  const activate = (index) => {
    steps.forEach((s, i) => s.classList.toggle("is-active", i === index));
    screens.forEach((s, i) => s.classList.toggle("is-active", i === index));
    if (scope) scope.style.setProperty("--extend", `${[72, 45, 0][index]}%`);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activate(steps.indexOf(entry.target));
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  steps.forEach((s) => io.observe(s));
  activate(0);

  // On a phone the held terminal would cover the steps: put a copy of each
  // step's recorded output under the step instead.
  const narrow = matchMedia("(max-width: 900px)");
  const place = () => {
    steps.forEach((step, i) => {
      let copy = step.querySelector(".step-screen");
      if (narrow.matches && !copy) {
        copy = screens[i].cloneNode(true);
        copy.className = "step-screen";
        copy.setAttribute("data-ui", "");
        step.append(copy);
      } else if (!narrow.matches && copy) copy.remove();
    });
  };
  narrow.addEventListener("change", place);
  place();
})();

// Surfaces: a command menu. Typing filters the rows; arrow keys, hover and
// taps move the selection, which opens the surface's recorded output.
(() => {
  const input = document.getElementById("surface-filter");
  const items = [...document.querySelectorAll(".menu-item")];
  const empty = document.getElementById("surface-empty");
  if (!input || !items.length) return;
  const fine = matchMedia("(hover: hover) and (pointer: fine)");

  const visible = () => items.filter((item) => !item.hidden);
  const select = (target) => {
    for (const item of items) {
      const open = item === target;
      item.classList.toggle("is-open", open);
      item.querySelector(".menu-row").setAttribute("aria-expanded", open);
    }
  };

  items.forEach((item) => {
    const row = item.querySelector(".menu-row");
    row.addEventListener("click", () => select(item));
    row.addEventListener("pointerenter", () => {
      if (fine.matches) select(item);
    });
  });

  input.addEventListener("input", () => {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    for (const item of items) {
      const haystack = `${item.textContent} ${item.dataset.keys}`.toLowerCase();
      item.hidden = !words.every((word) => haystack.includes(word));
    }
    const shown = visible();
    empty.hidden = shown.length > 0;
    if (shown.length && !shown.some((i) => i.classList.contains("is-open")))
      select(shown[0]);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const shown = visible();
    if (!shown.length) return;
    const current = shown.findIndex((i) => i.classList.contains("is-open"));
    const step = event.key === "ArrowDown" ? 1 : -1;
    select(shown[(current + step + shown.length) % shown.length]);
  });
})();

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
    status.className = `pill ${passed ? "pill-pass" : "pill-fail"}`;
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
