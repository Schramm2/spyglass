---
version: alpha
name: Spyglass
description: Repo-local brand and visual contract for the README images and offline evidence report.
colors:
  primary: "#b08d6e"
  on-primary: "#0f1514"
  surface: "#0f1514"
  on-surface: "#e9eeea"
  surface-raised: "#18201f"
  text-secondary: "#9aa5a1"
  evidence-pass: "#8fdc9a"
  evidence-fail: "#ff7462"
typography:
  display:
    fontFamily: "Gambarino, ui-serif, Georgia, serif"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.02em"
  body:
    fontFamily: "General Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  evidence:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  marketing: "0px"
  evidence: "10px"
spacing:
  button-inline: "1.5rem"
components:
  primary-action:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.marketing}"
  evidence-panel:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.evidence}"
    rounded: "{rounded.evidence}"
  evidence-metadata:
    textColor: "{colors.text-secondary}"
  evidence-passed:
    textColor: "{colors.evidence-pass}"
  evidence-failed:
    textColor: "{colors.evidence-fail}"
---

## Overview

Spyglass makes verification inspectable. The README carries the brand: large
serif type and engraved imagery. The offline report leads with the result and
the proof a reviewer needs. Keep those jobs distinct: brand scale does not
belong inside an operational report. The HTML manual was removed before
launch. The landing page in `landing/` is a deliberate exception to the brand
tokens below; see "Landing page".

### Evidence sources and ownership

The brand tokens in the front matter are the source for brand images. The
images live in `docs/assets/`. The report palette is defined
in `renderHtml` in `src/report.ts`; update this contract in the same PR when
a shared visual decision changes. `FRONTEND.md` owns rendering, state and verification.

### Surface map

| Surface        | Reader's job                                    | Hierarchy and exception                                                                                 |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| README         | Understand the tool and start the quickstart    | Large serif wordmark, engraved chart imagery, then plain Markdown                                       |
| Offline report | Decide what was proved                          | Result, claims, source, findings, attempts, artifacts and cleanup; dense system-font layout             |
| Demo app       | Supply a real verification target               | Preserve its fixture appearance unless a check requires a deliberate change; do not apply site branding |
| Landing page   | Understand the tool, try a run, star or install | Its own tile-board system in `landing/styles.css`, not the brand tokens; see "Landing page"             |

### Landing page

The landing page in `landing/` uses its own visual system, chosen to differ
from the README brand: a board of flat tiles on 8px gaps, a soot ground
(`#0f0f0f`), white and grey fields, and one lime action colour (`#dafa9c`).
Inter Tight is the only typeface; monospace appears only in commands and
product fragments. Corners are square, and the page has no gradients, glows,
resting shadows or engraved imagery. Its pictures are the product's own
interface: report, folder, run-card and check fragments built from a real
quickstart run. The tokens live at the top of `landing/styles.css`; change
them there, not in the front matter above.

### Voice and content

Use the terms in `GLOSSARY.md`. Write direct labels and repair instructions.
A passed step is not a passed claim. Show failed, incomplete and cleaned-up
states truthfully. CLI excerpts and report-state examples must come from real
runs; copied output keeps its original text. Keep long IDs and paths readable. The report wraps long source fingerprints,
commands and artifact paths without document-width overflow at narrow widths.
Command controls show their command and expected failure. Recorded control
attempts stay distinct from validated control proof. Findings appear directly
below the source and status. External cleanup uses “not required” when the
profile has no external owner.

## Colors

The brand is a ship's watch: the spyglass, the sea chart and the logbook that
keeps each sighting after the voyage. The brand uses a sea-black ground
(`#0f1514`), chart-white text (`#e9eeea`) and one bronze action accent
(`#b08d6e`). Chart-paper sections provide intentional contrast in the
marketing page. Pass and
fail colors identify evidence states, not decorative marketing categories.
Always pair a status color with text. The report is an intentional separate
palette, defined in `renderHtml`; it does not load the brand's dark theme.

## Typography

Gambarino (one weight, 400) carries display headings; General Sans carries
brand prose; Geist Mono carries code, commands and technical data. Preserve
readable prose and compact, wrapping command examples rather than shrinking
all content to fit a phone. The offline report uses local system and monospace
fonts so it stays readable without web fonts or a network connection.

## Layout

At narrow widths, recorded output sits with the step it explains. Code may
scroll within its own container; the page itself must not clip useful content.
Keep operational report spacing compact enough to compare claims and steps.

## Imagery

README and social images are one-ink copperplate engravings of the ship's
watch on the sea-black ground, with bronze only on the instrument. Codex image
generation drew the artwork without text; the type is set afterwards in the
brand faces, so letters stay exact. Do not add gradients, glows or 3D renders.

## Elevation

Use tonal surfaces and restrained borders for evidence panels. The brand
instrument imagery is not a reason to add dashboard shadows or card grids.

## Shapes

Brand actions are square. Evidence fragments use the small rounded panel
shape in the tokens. Search fields, copy controls and status pills keep their
implemented surface-specific shapes; do not force them into one radius.

## Components

Primary actions use bronze with sea-black text. Hover uses the stronger bronze
value; pressed actions scale slightly. Report states keep incomplete, failed
and passed records distinct.

### Accessibility and states

Keep the bronze focus outline, skip links, native keyboard controls and visible
labels. Check normal text contrast at 4.5:1 and large text at 3:1 when changing
colors. Preserve status words as well as color. Reduced motion removes staged reveals
and movement without hiding the final information.

### Motion and interaction

Motion explains the change from a claim to its evidence. Keep the implemented
reduced-motion fallback and coarse-pointer behavior. Avoid introducing motion
into the report, which must work offline and without JavaScript.

## Open Questions

- There is no maintained full accessibility or contrast audit. The existing
  colors are observed implementation values, not a claim of full WCAG
  conformance. A visual change must verify its affected states in a browser.
