# Agent skills

The [`skills/`](../skills) directory holds the agent skills for Spyglass. They
use the [Agent Skills](https://agentskills.io) format.

| Skill                                                                           | Purpose                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`spyglass`](../skills/spyglass/SKILL.md)                                       | Run a verification with Spyglass.               |
| [`create-verification-skill`](../skills/create-verification-skill/SKILL.md)     | Create a repository's own `verify-<app>` skill. |
| [`maintain-verification-skill`](../skills/maintain-verification-skill/SKILL.md) | Keep that skill current as the app changes.     |

Copy a skill folder into the skills directory of your agent harness, for
example `.claude/skills/` or `.agents/skills/`.

The harness also needs a way to run shell commands and a plan of the claims to
verify. Each command gives a versioned JSON result with `--json`, uses stable
exit codes and never prompts.
