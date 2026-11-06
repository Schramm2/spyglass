# Configuration

`spyglass init` writes a **profile** (`spyglass.json`). It contains the tools,
commands, bindings and evidence rules for one repository. Use
[commands](commands.md) for the surfaces that the profile commands drive.

Review the guessed fields before you run `up`. The `init` output includes
`setup.reviewFields`, `setup.prerequisites`, `setup.commands` and `setup.notes`.
These name the plan, a discovered check, result validation, cleanup and report
reopening. Replace `CLAIM_ID` with a claim from your plan; write observations
with `result set` after you read the evidence. See the
[example profile](../examples/demo.profile.json) and the
[example plan](../examples/demo.plan.json).

The JSON schemas are in [`schemas/`](../schemas). The profile, plan and result
schemas are version 1. You can also print them:

```sh
spyglass schema profile
spyglass schema plan
spyglass schema result
```

## Lifecycle modes

A profile selects one lifecycle mode:

| Mode       | Who starts and stops the app                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owned`    | Spyglass starts a process group and stops it on `down`.                                                                                                                                                    |
| `external` | The repository's own tool starts and stops its resources. Spyglass records its doctor and checks. A named check with `cleanup: true` records the owner's cleanup. `down` closes only the Spyglass browser. |
| `none`     | There is no persistent target, for example a library journey.                                                                                                                                              |

## Timeouts and bindings

For a long command, use `spyglass exec --timeout-ms 900000 --run ID -- COMMAND`.
The default is 300 seconds; the maximum is 24 hours. The selected deadline is
retained with the result. CLI binding overrides are retained with their resolved
values, including bindings added only on the command line. The names `repo`,
`run`, `port`, `web`, `api` and `evidence` are reserved run values. `up` rejects
conflicting bindings before allocation with `RESERVED_BINDING`. Use `ownerPort`
for a repository-owned port; `${port}` is allocated by Spyglass.

## Credentials

Do not put credential values in a profile. Use references:

- `env:NAME`
- `file:path`
- `dotenv:path#KEY`
- `op://vault/item/field` (1Password CLI)

A **seat** is a named test identity with credential references. Screenshots can
contain private data. Examine the page state before you take one.

## Tools that the profile needs

Spyglass does not install tools, fetch secrets or start your app during `init`.
Install the tools for the surfaces that the profile declares:

| Tool                                                                  | Necessary for                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`agent-browser`](https://www.npmjs.com/package/agent-browser) 0.38.2 | `up` for a profile with a `web` origin. Browser checks (`ui`) also need its Chromium. |
| Docker Compose                                                        | Container status and logs (`ps`, `logs`)                                              |
| A PostgreSQL database                                                 | Database reads (`db`). The driver is included.                                        |

See [platform and external-tool support](support.md) for tested configurations
and unverified platforms.
