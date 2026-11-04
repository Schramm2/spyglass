# Git workflow

Read this before creating a branch, choosing a pull request target, merging,
or preparing a release. Spyglass uses **Git Flow**, with `dev` as the default
and integration branch and `main` as the release branch. All promotions use
pull requests and merge commits; squash and rebase merges are disabled.

## Branch roles

| Work                          | Start from                 | Branch                                      | PR target           |
| ----------------------------- | -------------------------- | ------------------------------------------- | ------------------- |
| Feature                       | `dev`                      | `feat/<name>`                               | `dev`               |
| Non-urgent fix                | `dev`                      | `fix/<name>`                                | `dev`               |
| Docs, CI, maintenance         | `dev`                      | `docs/<name>`, `ci/<name>`, `chore/<name>`  | `dev`               |
| Release preparation           | `dev`                      | `release/<version>`                         | `main`              |
| Urgent release fix            | `main`                     | `hotfix/<name>`                             | `main`              |
| Release back-merge            | `main`                     | `main`                                      | `dev`               |
| Hotfix into an active release | `main`                     | `main`                                      | `release/<version>` |
| Release-only repair           | Active `release/<version>` | `fix/<name>`, `docs/<name>`, `chore/<name>` | That release branch |

Dependabot's `dependabot/*` branches target `dev`. The CI branch-policy check
also permits the release and hotfix branches to return their fixes to `dev`,
and hotfix branches to enter an active release. Use the `main` back-merge by
default: it carries the actual release merge and any release fixes together.
Long-lived source branches in a back-merge must belong to this repository,
not a contributor's fork with the same branch name.

Ordinary work does not target `main`. A release branch takes only release
fixes, version changes and release notes; new features continue on `dev`.
Read `agent_docs/delivery.md` for the version and release procedure.

## Start and deliver ordinary work

1. Inspect the working tree and preserve unrelated changes. Fetch `origin`.
2. Create a named branch from current `origin/dev`. Use a worktree when the
   current checkout has unrelated work that must remain in place.
3. Record the base with `git config branch.<branch>.gh-merge-base dev`.
4. Use Conventional Commit subjects (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`).
   Commit one verified logical change at a time; stage paths by name.
5. Run the pre-push checks in the delivery guide. Push the branch and open a
   PR with an explicit `--base dev`; complete the PR template.
6. Review the final diff and the checks on the PR's current head. Merge with
   a merge commit only after all required checks pass and conversations are
   resolved. A fresh review is useful even though a second human approval is
   not required for this single-maintainer repository.

Done when the PR is merged into its intended target and the local target is
fast-forwarded to the remote. Report a queued or open PR as such, not as merged.

## Release and hotfix back-merges

After a release PR reaches `main`, open a PR from `main` into `dev`. After a
hotfix reaches `main`, back-merge `main` into the active `release/*` branch,
or into `dev` when no release is open. When that release later reaches `main`,
back-merge it into `dev` too. Do not rewrite pushed history to avoid a merge.
Resolve conflicts on an appropriate working branch and rerun affected checks.

Release completion includes its required back-merge, not just a tag. Tag only
the merged release commit on `main`, and only when the user requests a release.
The default branch is `dev`, so release commands must name the tag or `main`
explicitly rather than use the GitHub default.

## Enforcement and ownership

GitHub branch protection requires PRs, passing CI and resolved conversations
on `dev` and `main`, including for administrators. Force pushes and deletion
are blocked. There is no standing bypass. A failed or missing gate needs a
repair, not an administrator merge. `CI / Branch policy` checks the PR branch
roles; `agent_docs/ci.md` explains the remaining gates.

Automatic head-branch deletion is disabled because a merged back-merge must
not delete `main` or `dev`. Delete a short-lived branch only with explicit
approval, after its release or back-merge obligations are complete.

Protected `release/*` branches have the same PR, CI and conversation rules
through the `Release branch protection` ruleset. Creating the branch is
allowed; later changes use a PR from a release-only repair branch.

The required status is `CI required`, from the GitHub Actions app. Its
aggregate requires each applicable gate in `agent_docs/ci.md`. The settings
do not require a branch to be updated with the base before merging: forcing
`dev` into a release or hotfix would defeat release isolation. PR checks test
GitHub's proposed merge result; rerun them when a base change affects the
proof. Review the merge result before landing.

The branch-policy gate checks names and targets; it cannot prove that a
release contains only approved work or that a required back-merge was done.
The operator must check the source diff, ancestry and open PRs. Branch
protection settings are server state, not files: inspect them with
`gh api repos/Schramm2/spyglass/branches/dev/protection` and the matching
`main` endpoint when diagnosing an unexpected merge permission. Inspect
release patterns with `gh ruleset check release/<version>`; that command
does not display classic branch protection, so use the API for `dev` and
`main`.

## Migration boundary

`dev` was created at `5354584`, the then-current `main`, without rewriting
history. That commit already contained the unreleased M1.2 change. Earlier
PRs correctly used the old GitHub flow; do not retarget or rewrite them.
Future feature work integrates through `dev`. No version was released by
this workflow migration.
