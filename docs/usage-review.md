# Sustained-use review

**Reviewed 5 November 2026. Status: findings recorded; repairs not implemented
by this review.** This page records sanitized findings from a maintainer's
private workspace audit and the public work they justify. The
[roadmap](roadmap.md#m31-harden-the-current-workflow) owns priority and delivery.

## What the review establishes

Spyglass has sustained use across browser, HTTP, library and command checks.
The next need is to make this workflow reliable and reduce the work needed to
finish and retain proof, not to establish first use again.

This is a retrospective usage review, not an equal-proof comparison. It does
not establish general speed, human usability, market demand or support for
additional platforms. Earlier public comparisons and their limits remain
unchanged.

## Evidence and limits

The maintainer inspected loose evidence, retained worktree copies, proof
archives, local run state and repository-owned verification instructions.
Copies were grouped by run ID and first step ID. The longest retained log
was selected, with summary count as the tie-breaker. Report counts use the
latest retained summary for each distinct run.

| Measure                                                   |    Recorded result |
| --------------------------------------------------------- | -----------------: |
| Distinct retained runs                                    |                160 |
| Recorded steps after copy removal                         |              2,838 |
| Artifact records checked per distinct run                 |              2,215 |
| Missing files or checksum differences among those records |                  0 |
| Runs with a complete latest report                        |                 66 |
| Runs with an incomplete latest report                     |                 28 |
| Runs with no discovered report summary                    |                 66 |
| Runs with successful `down` but no discovered summary     |                 65 |
| Browser proof timeouts                                    |                 17 |
| Recorded duration of those timeout steps                  | About 20.5 minutes |
| Runs with rejected control results                        |                 20 |

The records span 23 October to 5 November and tool versions 1.1.0 through
1.3.1. Historical outcomes must not all be attributed to current `dev`.
Incomplete reports and missing summaries are not a product failure rate:
some runs are deliberate controls, baselines or replaced attempts. Wider
owner bundles can contain proof outside Spyglass.

These are maintainer-reported aggregates. Raw logs, target source, screenshots,
run identifiers and machine paths remain private and are not published here.
The private audit retains inventories, repeatable scan scripts and a checksum
manifest; public readers cannot independently reproduce these totals from
this repository. They are not a public benchmark artifact or release proof.

Every discovered log and its recorded artifact references received mechanical
checks. Semantic review was targeted at failures, controls, source drift,
report completion and retention. It was not a manual inspection of every
screenshot or claim. Checksums identify bytes; they do not authenticate an
author or establish semantic correctness. The workspace was active during
the scan, so this is not an atomic inventory or a count of all historical use.
No target was started, host contacted or hosted artifact downloaded again.

## Findings and acceptance checks

The checks below are proposed work, not claims that the current CLI meets
them. Before each behavior change, reproduce the failure with a public
fixture and a failing built-CLI E2E check. Keep private integration details
out of generic modules, fixtures and committed evidence.

### R1. Reliable browser proof

**Observed:** proof timeouts blocked visual verification and led to repeated
retries. Other recorded development-preview checks needed a separate
repository-owned browser journey after the adapter path failed.

**Current source concern:** `captureProof` batches several observations,
buffer clears, animation frames and image capture. A timeout can return no
partial results and no useful stage diagnosis. Console, error and network
buffers can be cleared before their contents are durably retained. Source
inspection does not identify which stage caused a historical timeout.

**Repair:** reproduce sheet and development-preview failures. Retain partial
evidence before clearing buffers, name the stalled operation and make capture
and failure-capture budgets explicit. Do not widen origins, attach to a
person's browser or replace visual proof with a DOM observation.

**Acceptance:** a public journey produces an inspectable image and retained
diagnostics. A forced capture-stage timeout names the stage, keeps earlier
evidence, bounds recovery and leaves the claim incomplete. Repeat affected
real-tool checks and retain the report after cleanup.

**Resolution (issue #47; unreleased):** the [public capture record](browser-capture-r1.md)
retains the reproduction method, failure-first outcomes, image inspection and
repeat commands. Capture now saves diagnostics before clearing buffers or
capturing the image, names failed stages, bounds recovery and leaves failed
visual claims incomplete. Public checks use a real browser with controlled
frame suspension and a screenshot transport timeout. They do not establish
the cause of the historical private timeouts; no private-target repeat was run.
The historical observations above remain unchanged.

### R2. Validate control modes before starting work

**Observed:** control declarations were rejected after checks had already
run. Repairs included replacing prose with an actual assertion ID and
correcting command-form declarations.

**Current source concern:** the plan schema permits an expectation-only
control or both assertion and command modes, while result validation rejects
those combinations. A read-only schema probe confirmed this mismatch.

**Repair:** reject impossible mode combinations before allocation or owner
readiness. Validate claim references and duplicate IDs early. Expose recorded
assertion IDs and command forms rather than making the operator guess them.
Keep observations operator-written.

**Acceptance:** invalid plans start no resources. Valid assertion and
command-plus-failure controls complete. An unrelated setup failure cannot
satisfy the declared intended failure.

### R3. Inspect proof after worktree removal

**Observed:** owners retained reports and scratch scripts outside removed
worktrees, but CLI state still pointed to original locations. Read-only
status could mark a worktree removed yet list no completed checks from the
relocated evidence. A missing original path is not proof that its evidence
was lost.

**Repair:** support read-only inspection of retained evidence without its
original worktree or run store. Evaluate export with a manifest, explicit
owner evidence links and selected scratch inputs. Preserve original paths
as provenance; do not rewrite the recorded run location. Make unavailable
evidence explicit in status.

**Acceptance:** after removing a disposable worktree, a fresh environment can
inspect its moved complete and failed proof, including source, controls,
artifacts and cleanup. Missing or changed bytes are detected. Offline review
needs no original run store.

### R4. Keep claim scope and completion scope distinct

**Observed:** a saved-state claim used `behavior` kind, so the CLI did not
enforce an earlier action and a later independent read. Wider owner evidence
contained the browser work; the complete Spyglass report alone covered less
than the full change. Some library checks already retain independent reads
inside structured owner artifacts.

**Repair:** distinguish a read-only observation from a write or persistence
claim. Use side-effect claims for writes and retain their action and later
independent read. Evaluate explicit binding of validated owner records;
do not discard real runner assertions or repeat work only for bookkeeping.
Keep the run's verdict separate from repository-wide completion.

**Acceptance:** a GET alone cannot prove a write. A scoped read-only claim
can pass. A supported owner journey retains its real action/read evidence.
Missing repository gates stay visible in the overall completion record. The
CLI must not infer semantic coverage from prose or assign claim kinds itself.

### R5. Finish failed and abandoned runs with a report

**Observed:** many runs were stopped without a discovered summary, including
intentional fault runs. `finish` currently stops at its first failed stage;
its manual cleanup/report path requires more operator work.

**Repair:** provide a bounded terminal path that attempts owner cleanup,
Spyglass cleanup and a diagnostic report while preserving the original
failure. Choose its interface during implementation; this review promises
no new command or option. Keep controls and replaced runs distinguishable.

**Acceptance:** failed verification cannot suppress cleanup or the diagnostic
report. Cleanup failure stays visible. No failure becomes a pass and no
unrelated resource is stopped. Preserve existing `finish` behavior unless an
explicit, documented contract change replaces it.

### R6. Retain the source baseline without repeating its full file map

**Observed:** distinct loose logs occupied about 810 MiB. In the largest
sampled log, repeated top-level source objects took about 95% of its bytes.
The median latest JSON summary was about 3.1 MiB; the largest was about
56.2 MiB. These are storage measurements, not latency measurements.

**Repair:** evaluate one checksummed full baseline with compact per-step
identity references. Preserve historical readers and all attempts, source
checks and artifact checksums. Follow public-contract delivery rules before
changing the format.

**Acceptance:** a long public journey retains equal proof with materially
smaller logs and reports. Changed source or baseline bytes still fail
validation. Old evidence remains readable. Measure parse/render time before
making a speed claim.

### R7. Bring adoption recipes up to the delivered workflow

**Observed:** local version pins lagged the installed build, and recipes still
used many separate waits, reads and captures. A synthetic false-assertion
control checked runner parsing; it did not establish detection of a product
fault. Real mutation controls existed separately.

**Repair:** align tested versions and recipes. Prefer existing `ui verify`,
bounded expectations, live linking and named checks when they preserve proof.
Keep finite-animation completion explicit. Label parser controls separately
from product-fault controls and retain both when required.

**Acceptance:** a fresh operator completes a fixed journey without undocumented
help, with the same assertions, inspections, source identity and cleanup.
Record calls and repairs before claiming improvement. Target repositories
own their recipes; Spyglass owns generic guidance.

### R8. Safe interruption recovery

**Observed:** owner instructions described manual dead-lock removal after an
external tool timeout. No active lock was found in this audit.

**Repair:** evaluate CLI-owned dead-owner recovery with process start-time
checks, resource ownership checks and a retained interruption record. Do not
automatically remove live or unverifiable locks, or kill by process name.
No active command does not mean that no other run owns a browser.

**Acceptance:** a forced operator interruption is recorded and only its owned
resources can be recovered. Live locks, reused PIDs and uncertain ownership
are refused.

### R9. Connect owner gate evidence without duplicate execution

**Observed:** older owner records describe valid gate proof that could not be
cited across installation bindings. Current code has narrower binding
analysis, so this historical refusal is not an established open binding bug.

**Repair:** repeat the refusal on current code first. Prefer a repository-owned
completion record over another manually maintained verdict. If new import
support is justified, validate producer, source, command, assertions, skips,
artifacts and outcome; arbitrary uploaded text is not executed gate proof.

**Acceptance:** valid exact-source proof is reusable without duplicate checks.
Changed source, relevant binding differences, missing artifacts and failed
or skipped required checks are refused. A repair already delivered is recorded
as such rather than rebuilt.

## Delivery boundaries

[Milestone M3.1](roadmap.md#m31-harden-the-current-workflow) groups these
findings into four slices. None is completed by this document. A slice needs
a public failure case, failure-first E2E proof, retained candidate evidence
and an explicit account of remaining private-target limits.

Keep source drift refusal, failed attempts, exact-origin browser isolation,
external lifecycle ownership, structured runner assertions and honest reports.
The review does not authorize weaker proof, a release, npm publication or a
hosted service. New adapters remain demand-led after reliability repairs.
