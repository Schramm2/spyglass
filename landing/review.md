# Landing page UI review

## Task and scope

Mode: review and implementation. Review base: `4362b92` on `dev`.

The page serves people who use coding agents and people who review code.
Their task is to understand what Spyglass proves, inspect an example, then
open the quickstart or copy the install command. The expected end state is a
clear next action, not an installation performed by the page.

Known: the page is static, has no build step, and must remain readable without
JavaScript or external requests. The tile-board design in `DESIGN.md` is the
visual contract. Assumed: visitors can read basic CLI commands, but can be
new to Spyglass. Check desktop and phone layouts, pointer and keyboard input.
No representative user study was available; easier discovery and clearer
understanding remain hypotheses.

The review covers the hero, report and folder examples, simulation, run flow,
signature, six feature tiles, tool list, responsibility limits, final actions
and footer. Existing document-link repairs and the footer security-note link
belong to separate work. The new hero quickstart action uses `dev`.

## Journey and states

1. Read the product description and requirements. Open the quickstart, or
   read and copy the install command. Copy acknowledges a pending write,
   reports completion after it finishes, and selects the command for manual
   copy on refusal. The control cannot send duplicate writes while pending.
2. Enter the local simulation. No commands run and no files change. With
   JavaScript disabled, the notice explains the disabled controls and the
   initial output stays visible.
3. Record a result and complete cleanup. The report becomes Complete. Enable
   a source, assertion or browser-origin fault: the required proof is missing
   and the report becomes Incomplete. Disable the fault to recover.
4. Enable a write-query or second-operator fault. The action is refused, but
   the earlier health proof remains valid. The explanation distinguishes
   refused optional work from missing required proof. Reset returns to the
   initial Incomplete state without moving keyboard focus.
5. Read how a run works, the supported tools and the limits. Open the final
   quickstart action or use the footer navigation. A failed star-count request
   leaves the GitHub link available without a count.

There are no forms, destructive actions, saved visitor inputs or background
jobs on this page. Form validation, undo and persisted submission checks do
not apply. The simulation has immediate local state, not server loading.

## Findings and changes

Order reflects task harm and recovery cost, not the number of principles.

| Priority | Location and observed problem                                                                                                                                      | Change and principle                                                                                                                                                                                                                          | Confirming check                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Feature tiles: “Secrets stay out of reports” reads as an unconditional guarantee. Read-only SQL copy omits the privileged-function limit in `docs/limitations.md`. | State text-masking limits, require artifact review and name the restricted-role boundary. Keep consequences visible before adoption.                                                                                                          | Compare with the documented limits and source masking boundary; inspect both tiles. This does not audit the masking implementation.   |
| High     | Hero: the only quickstart action is at the far end of a horizontally scrolling phone rail. The install command is clipped inside a narrow scrolling field.         | Put the quickstart beside the description and requirements. Wrap the full command; put Copy below it on phones. Visual hierarchy and recognition reduce hidden navigation, at the cost of a taller hero.                                      | Real page at 320, 390, 760, 1024 and 1440 CSS pixels; visible action and no command or document overflow.                             |
| High     | Report preview: the desktop description covers report rows; the phone preview clips before the attempts.                                                           | Use normal document flow. Keep the real report excerpt unchanged and allow its full height. Common region now groups the description separately from evidence. The page is taller.                                                            | Layout checks, full-page screenshots and report inspection at narrow and wide widths.                                                 |
| Medium   | Copy: refusal changes the label to “Select it” for two seconds, but does not select the command or explain recovery. Copy also looks active without JavaScript.    | Hide until setup, provide persistent status, prevent pending duplicates and focus/select the command on refusal. Feedback and recovery take priority over a shorter component.                                                                | Real clipboard write and independent clipboard read; controlled refusal and delayed external clipboard response; JavaScript disabled. |
| Medium   | Simulation: it looks like a live CLI, phone controls follow long output, and two live regions can announce a full replaced transcript.                             | State that it is local. Put controls before output and report before transcript. Keep one concise status by the controls. Keep native switches and keyboard focus. Grouping and feedback take priority over the old output-first composition. | All five faults, completion, recovery, reset, Space and Tab input; state and focus assertions. Screen-reader speech remains untested. |
| Medium   | Simulation: refused writes and a blocked second operator can leave a Complete report with no explanation.                                                          | Explain why the earlier required evidence remains valid. Recognition and accurate feedback avoid teaching that any failed step invalidates a claim.                                                                                           | Both optional faults retain Complete and supply a refusal explanation; required-proof faults remain Incomplete.                       |
| Medium   | Signature: continuous motion pauses only on hover.                                                                                                                 | Make it a still, wrapping signature. This removes decorative movement rather than adding another control.                                                                                                                                     | Normal-motion and reduced-motion checks; the signature has no running animation.                                                      |
| Medium   | Layout: tall run-flow fields add long gaps on phones; offset feature fragments can crop useful text; enlarged navigation text can overflow.                        | Use content-driven heights, contain fragments, wrap rows and long values, and keep a contrasting switch boundary. Choice and pointing effort improve without hiding information.                                                              | Doubled body-text proxy at 320 and 1440 pixels, section screenshots, keyboard focus and automated contrast checks.                    |

## Principle groups

- **Grouping and hierarchy:** preserve the tile system; separate description,
  actions and report rather than stacking an overlay. Keep DOM and phone
  reading order aligned. Compare visual order with keyboard order.
- **Choice and effort:** retain useful documentation and GitHub paths. Make
  the primary quickstart visible instead of removing alternatives. Preserve
  full-width switch hit areas and explicit labels. The switches are at least
  48 CSS pixels high; the thumb alone is not the target.
- **Memory:** keep the command, requirements and simulation instructions
  visible. Show the reason for each report state; do not require recall of
  an earlier screen or a terminal message.
- **Feedback and flow:** distinguish pending copy, completed copy, refusal,
  incomplete proof and refused optional work. Keep recovery and reset local.
  Avoid invented progress, automatic navigation and hidden completion.

## Verification and retained evidence

Repeatable commands are in `landing/README.md`. The owning E2E file is
`tests/e2e/landing.test.mjs`; failure cases are in `docs/failure-cases.md`.
It uses the existing Node test runner and real Chromium through the installed
`agent-browser`. No framework, package dependency or production test hook was
added. Only external clipboard behavior is replaced for refusal and delay.
External requests are blocked during E2E checks to exercise the font fallback
and missing star count.

- All seven child checks fail against the archived review base for the
  intended missing behavior. The initial copy-status and mobile-order
  failures were made explicit before the final baseline run.
- The seven child checks pass on the changed page. Final image inspection
  found clipped folder files and product facts in the phone flex layout.
  A new assertion failed at 760 pixels before the content-height fix. The
  earlier run stays incomplete; the final run checks the corrected page.
  Screenshots include full
  pages at 320 and 1440 pixels, five hero widths, keyboard interaction,
  clipboard refusal, JavaScript disabled and each section with doubled text.
- The doubled-text check scales computed task-text sizes to 200%; it is a
  text-only resize proxy, not a native browser zoom or full conformance test.
  Branding and the decorative signature are excluded from that proxy.
- Axe 4.12.1 reports zero violations at 320 and 1440 pixels with reduced
  motion. It leaves manual contrast review for arrow glyphs and, in the wide
  scan, the wordmark. The wordmark uses dark text on white; arrow controls
  retain their text labels. This is not a full WCAG conformance claim.
- `npm run build`, the default `npm test`, `npm run format:check` and
  `git diff --check` are the repository gates. The default suite does not run
  Docker-backed CLI surface checks. The landing-page suite runs separately.

Local evidence stays under `.spyglass/landing-review/`; the final Spyglass
report stays under `.spyglass/runs/landing-ux-final-2/`. These ignored folders
must stay with the worktree if their evidence is needed. The report records
the exact final source identity, checks, inspections, limits and cleanup.
Do not treat an earlier candidate image as final-source proof.

## Limits and follow-up

- No representative user, screen reader, native touch device, Safari or
  Firefox trial was performed. Keyboard, browser semantics and viewport
  checks do not establish comprehension or physical-device usability.
- No installation, external document availability, live GitHub star response
  or exact five-minute completion claim is proved by these page checks.
- Short entrance and scroll reveals remain, with reduced-motion fallbacks.
  Their usability benefit is untested; no new continuous motion was added.
- Outside this task: the CLI browser/Docker suite remains the owner of real
  tool behavior. Run it when those adapters change; this static-page review
  is not evidence for database safety or secret masking correctness.
- Design maintenance risk: product version and external-tool version appear
  as static page facts. Check them during release review. If drift recurs,
  add a release-owned content check rather than a client-side version fetch.
