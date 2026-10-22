# Contributing to Spyglass

Thank you for your help. This guide tells you how to report a problem, set up
the project and send a change.

## Report a problem or request a feature

- Search the [open issues](https://github.com/Schramm2/spyglass/issues) first.
- For a bug, give the Spyglass version (`spyglass --version`), your Node.js
  version, the command, the `--json` output and the exit code.
- Do not put credentials, cookies, screenshots of private data or private
  application data in an issue.
- To report a security vulnerability, follow [SECURITY.md](SECURITY.md).

## Set up the project

You need Node.js 24 or later and Git.

```sh
git clone https://github.com/Schramm2/spyglass.git
cd spyglass
npm ci
npm run build
```

## Run the tests

```sh
npm test
```

This builds the CLI and runs the end-to-end tests in `tests/e2e/`. The tests
run the built CLI in temporary Git repositories.

The surface tests use a real Chromium browser and a PostgreSQL database in
Docker. To run them, install `agent-browser` 0.38.2 with its Chromium, start
Docker, then run:

```sh
SPYGLASS_TEST_SURFACES=1 npm test
```

## Send a change

1. Fork the repository and make a branch from `main`.
2. Write the failure case and its test before the implementation.
3. Make the change. Keep it small and on one subject.
4. Run `npm test` and `npm run format:check`. Use `npm run format` to fix the
   format.
5. Open a pull request into `main`. Tell what changed, why, and how you
   verified it.

### Rules for changes

- **Test observable behavior.** Tests go through the public CLI, real tools
  and the retained evidence. Do not test internal functions.
- **Use the project terms.** Read [GLOSSARY.md](GLOSSARY.md) before you name a
  concept.
- **Keep modules generic.** Generic modules contain no paths or names from a
  specific repository. A repository profile holds its integration details.
- **Keep the record honest.** Do not remove failed attempts, source identity
  or cleanup records.
- **No private data.** Never commit credentials, browser state, evidence
  folders or private application data.
- **Skills.** The skills in `skills/` are the source of truth. Keep the
  `LICENSE` file of each adapted skill.

## Code of conduct

This project follows the [code of conduct](CODE_OF_CONDUCT.md). When you take
part, you agree to follow it.

## License

When you contribute, you agree that your contribution is licensed under the
[MIT License](LICENSE).
