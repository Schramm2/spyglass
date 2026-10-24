// Spyglass docs behaviour. The manual reads in full without this script.

// Contents: open on wide screens; a phone shows it as a closed disclosure.
(() => {
  const details = document.getElementById("toc-details");
  const wide = matchMedia("(min-width: 901px)");
  const sync = () => (details.open = wide.matches);
  wide.addEventListener("change", sync);
  sync();
  details.addEventListener("click", (event) => {
    if (!wide.matches && event.target.closest("a")) details.open = false;
  });
})();

// Scrollspy: the contents link of the section being read is current.
(() => {
  const links = new Map(
    [...document.querySelectorAll(".toc a")].map((a) => [
      a.getAttribute("href").slice(1),
      a,
    ]),
  );
  const targets = [...document.querySelectorAll(".doc, .cmd")].filter((el) =>
    links.has(el.id),
  );
  if (!("IntersectionObserver" in window)) return;
  const visible = new Set();
  const mark = () => {
    // A command block sits inside the Commands section: prefer the block.
    const current =
      targets.find((el) => visible.has(el) && el.classList.contains("cmd")) ??
      targets.find((el) => visible.has(el));
    for (const a of links.values()) a.removeAttribute("aria-current");
    if (!current) return;
    links.get(current.id).setAttribute("aria-current", "true");
    // Mark the Commands section too while one of its blocks is current.
    if (current.classList.contains("cmd"))
      links.get("commands")?.setAttribute("aria-current", "true");
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        entry.isIntersecting
          ? visible.add(entry.target)
          : visible.delete(entry.target);
      mark();
    },
    { rootMargin: "-20% 0px -65% 0px" },
  );
  targets.forEach((el) => io.observe(el));
})();

// Search: hide the sections and commands that do not match every word.
(() => {
  const input = document.getElementById("docs-filter");
  const sections = [...document.querySelectorAll(".doc")];
  const commands = [...document.querySelectorAll(".cmd")];
  const empty = document.getElementById("no-match");
  if (!input) return;

  const matches = (el, words) => {
    const text = `${el.textContent} ${el.dataset.keys || ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };

  input.addEventListener("input", () => {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    for (const cmd of commands)
      cmd.hidden = words.length > 0 && !matches(cmd, words);
    let shown = 0;
    for (const section of sections) {
      const ownCommands = section.querySelectorAll(".cmd");
      const hit = ownCommands.length
        ? [...ownCommands].some((cmd) => !cmd.hidden)
        : matches(section, words);
      section.hidden = words.length > 0 && !hit;
      if (!section.hidden) shown += 1;
    }
    empty.hidden = shown > 0;
  });

  addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.target.closest("input, textarea")) return;
    event.preventDefault();
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    input.value = "";
    input.dispatchEvent(new Event("input"));
  });
})();
