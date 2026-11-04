---
version: alpha
name: Spyglass
description: Repo-local visual contract for the site and offline evidence report.
colors:
  primary: "#d4a24c"
  on-primary: "#000000"
  surface: "#000000"
  on-surface: "#ffffff"
  surface-raised: "#0f0f0f"
  text-secondary: "#a8a8a8"
  evidence-pass: "#8fdc9a"
  evidence-fail: "#ff7462"
typography:
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
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

Spyglass makes verification inspectable. The site leads with a large, clear
statement, then real recorded output. The offline report leads with the
result and the proof a reviewer needs. Keep those jobs distinct: marketing
scale does not belong inside an operational report.

### Evidence sources and ownership

This contract records the implementation, not a redesign. Sources are
`landing/tokens.css`, `landing/styles.css`, `landing/docs/docs.css`,
`landing/main.js`, `landing/docs/docs.js`, `landing/report-states.js` and
`renderHtml` in `src/report.ts`. CSS remains the complete executable token
source; update this contract in the same PR when its shared visual decisions
change. `FRONTEND.md` owns rendering, state and verification.

### Surface map

| Surface        | Reader's job                                 | Hierarchy and exception                                                                                 |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Marketing      | Understand the tool and start the quickstart | Large type, brass action, real output and instrument imagery                                            |
| Manual         | Find a command or repair                     | Search, contents, readable explanations, then command examples                                          |
| Offline report | Decide what was proved                       | Result, claims, source, findings, attempts, artifacts and cleanup; dense system-font layout             |
| Demo app       | Supply a real verification target            | Preserve its fixture appearance unless a check requires a deliberate change; do not apply site branding |

### Voice and content

Use the terms in `GLOSSARY.md`. Write direct labels and repair instructions.
A passed step is not a passed claim. Show failed, incomplete and cleaned-up
states truthfully. CLI excerpts and report-state examples must come from real
runs; copied output keeps its original text. Keep long IDs and paths readable.

## Colors

The site uses black ground, white text and one brass action accent. Warm
paper sections provide intentional contrast in the marketing page. Pass and
fail colors identify evidence states, not decorative marketing categories.
Always pair a status color with text. The report is an intentional separate
palette, defined in `renderHtml`; it does not load the site's dark theme.

## Typography

Geist carries site prose and headings; Geist Mono carries code, commands and
technical data. The display scale is fluid in `landing/tokens.css`. Preserve
readable prose and compact, wrapping command examples rather than shrinking
all content to fit a phone. The offline report uses local system and monospace
fonts so it stays readable without web fonts or a network connection.

## Layout

Marketing uses fluid margins, large section gaps and distinct compositions.
The manual uses a desktop contents rail and a narrow-screen disclosure.
At narrow widths, recorded output sits with the step it explains. Code may
scroll within its own container; the page itself must not clip useful content.
Keep operational report spacing compact enough to compare claims and steps.

## Elevation

Use tonal surfaces and restrained borders for evidence panels. The marketing
instrument imagery is not a reason to add dashboard shadows or card grids.

## Shapes

Marketing actions are square. Evidence fragments use the small rounded panel
shape in the tokens. Search fields, copy controls and status pills keep their
implemented surface-specific shapes; do not force them into one radius.

## Components

Primary actions use brass with black text. Hover uses the stronger brass
value in CSS; pressed actions scale slightly. Copy controls give success or
failure feedback. Search has match and no-match states. The checksum control
has unavailable, matching, changed and restored states. Report controls select
real incomplete, failed and passed records; keep their distinctions visible.

### Accessibility and states

Keep the brass focus outline, skip links, native keyboard controls and visible
labels. Check normal text contrast at 4.5:1 and large text at 3:1 when changing
colors. Preserve status words as well as color. Marketing and manual content
must remain available without scripts. Reduced motion removes staged reveals
and movement without hiding the final information.

### Motion and interaction

Motion explains the change from a claim to its evidence. Keep the implemented
reduced-motion fallback and coarse-pointer behavior. Avoid introducing motion
into the report, which must work offline and without JavaScript.

## Open Questions

- There is no maintained full accessibility or contrast audit. The existing
  colors are observed implementation values, not a claim of full WCAG
  conformance. A visual change must verify its affected states in a browser.
- Marketing interactions have no dedicated automated E2E coverage yet. Use
  the browser checks in `FRONTEND.md`; the CLI surface suite is not proof of
  those interactions.
