# Spyglass

Read GLOSSARY.md before naming concepts. If a local, untracked `.plans/`
folder exists, read its current plan before work. Never commit `.plans/`.

Use TypeScript on Node 24. Build with `npm run build`. Run `npm test` for the
public CLI E2E checks. Write failure cases and tests before implementation.
Test observable behavior through the CLI, real tools and retained evidence.
Preserve unrelated work.

The agent skills in `skills/` are the source of truth for the `spyglass`,
`create-verification-skill` and `maintain-verification-skill` skills. Edit them
here. Keep each adapted skill's `LICENSE` file.

Generic modules contain no pilot-specific repository paths. Repository
profiles own integration details. A successful command is not proof of the
behavior it did not check. Keep source identity, failed attempts and cleanup.
Never put credentials, browser state, private application data, local
machine paths or internal project names in Git. This repository is public.

Use main as the integration branch. Commit only reviewed intended paths, and
run the build, tests and a secret scan before you push. Do not publish to npm
without a user request.
