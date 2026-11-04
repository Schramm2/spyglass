## What changed and why

## Target and scope

- Base branch and reason (`dev` for ordinary work; `main` for release/hotfix):
- Release or hotfix back-merge, if applicable:

## How you verified it

- [ ] `npm test` passes
- [ ] `SPYGLASS_TEST_SURFACES=1 npm test` passes, or the gap is stated below
- [ ] `npm run format:check` passes
- [ ] A failure-first E2E check covers changed behavior, or this change does not alter behavior
- [ ] Public contract docs and generated schemas are current where affected
- [ ] Secret scanning passes; the diff contains no private data or browser state
- [ ] Any committed benchmark evidence uses public fixtures and has been checked for safe disclosure

Checks not run, remaining limits, and retained evidence:
