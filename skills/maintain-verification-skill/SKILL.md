---
name: maintain-verification-skill
description: Audit a project's verification skill and feature map against source and live behavior, then deliver proven corrections.
disable-model-invocation: true
---

# Maintain a verification skill

Use this pass for a project skill with launch and drive steps and a feature map.
The unit of review is the feature: check each map entry against source, then
drive each feature live. A source review alone cannot complete the pass.

## Outcomes

End with exactly one outcome and name it:

- **clean:** every mapped feature has source and live coverage. The skill and
  map need no correction. Report any product defect separately.
- **changed:** proven corrections to the skill, profile, map, or an owned
  verification helper are live-tested against the final source.
- **blocked:** required coverage did not finish, or a correction could not be
  proved. State the exact missing access, tool, or behavior.

Keep a product defect separate from the skill outcome. This pass does not edit
product code or weaken an expected result to hide a defect.

## Scope

Edit only verification assets: the skill's `SKILL.md` and `features/`, the
Spyglass profile and plan that it owns, and its helper scripts. Do not change
product code. Report a missing Spyglass capability as an adapter gap for the
Spyglass owner. A project-owned helper may fill a narrow gap only when it has
a clear owner, repeatable output, and a live proof.

## Pass

1. **Find the skill.** Read repository instructions and locate the project
   verification skill. Check `.agents/skills/`, `.claude/skills/`, and
   `.cursor/skills/`. If several candidates can own the app, ask which one. If
   none exists, stop and name `create-verification-skill`.
2. **Read the contract.** Read the feature map index, every feature file, the
   profile, the applicable claim plan, and `spyglass --help`. Read the
   installed profile, plan, and result schemas with `spyglass schema profile`,
   `spyglass schema plan`, and `spyglass schema result`. In the Spyglass source,
   consult the schema and example files. Use the installed CLI version's
   syntax.
   If Spyglass is not installed, follow its README's terminal setup or mark
   live coverage blocked.
3. **Check the map.** Compare every feature with current source. Fix missing,
   extra, duplicate, or dead index entries. Check recent changes for affected
   user-facing routes, commands, and consumers that the map omits. Cite the
   concrete source path for each suspected gap.
4. **Plan the live pass.** Write claims for every mapped feature and each
   affected entry point. Include preconditions, expected results, relevant
   failure cases, named checks, and evidence. List exclusions with reasons.
   Group overlapping recipes so one prepared state can cover them safely.
5. **Prepare and drive.** Use the repository's existing lifecycle tool to
   prepare an isolated target. Keep its Doctor and Cleanup authoritative. Bind
   the target to Spyglass and record the owner's results. Run both Doctors
   before driving. Drive every mapped feature at least once and every affected
   path. Wait for asynchronous work to finish. Read side effects separately.
   Open and inspect actual screenshots for visual claims; record viewport,
   expected state, and observed state.
6. **Triage each failure.**
   - **Map drift:** source shows the app's working user path changed, while the
     feature map or recipe still names the old path. Update the map or recipe,
     then drive the new path.
   - **Adapter gap:** the user behavior works, but Spyglass or its configured
     browser, API, or command adapter cannot drive or observe it. Keep the
     expected result. Fix a narrow owned helper when that is within scope;
     otherwise report the missing capability and mark its claim blocked.
   - **Product defect:** the app fails the existing expected result. Keep that
     expectation unchanged. Record the failed claim and report the product
     defect separately; do not edit product code or relabel the failure as map
     drift.
7. **Prove corrections.** After each skill, map, profile, or helper change,
   repeat the affected live proof on the final source. If a verification claim
   or check changed, run a safe negative control that fails its intended
   assertion, restore the target, and show that the same expectation passes.
   Keep failed attempts and earlier source identity in the report.
8. **Clean up and deliver.** Use the owner's cleanup command for owned app,
   database, and installation resources. Then clean up Spyglass's resources.
   Confirm the report and evidence remain after cleanup. Re-read each changed
   file. Follow the repository's Git flow and report the diff, evidence,
   coverage, limits, cleanup, and final outcome. Leave changes uncommitted when
   the repository or task gives no authority to commit.

## Live-pass invariants

- **Health:** run both owner and Spyglass Doctor before the first drive and
  after an unexpected failure. Reset a stuck UI to a known state or relaunch
  the owner-managed target before retrying.
- **Evidence:** each passed claim cites completed steps and evidence from the
  same source. A visual claim cites an inspected image. A side-effect claim
  cites its independent read. Check that evidence remains after cleanup.
- **No residue:** clean up every failed or completed target through its owner.
  Stop only resources that this run owns. Retain proof while removing runtime
  state.
- **No false pass:** a process that accepts connections is not ready until
  the owner's readiness check passes. A request accepted with `202` is not a
  completed action. A screenshot or green exit code alone is not a claim.

Keep short run notes in a scratch location. Record features covered, blocked
preconditions, drift, adapter gaps, product defects, cleanup, and the selected
outcome. Do not commit those scratch notes.
