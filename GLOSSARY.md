# Spyglass

Spyglass verifies a code change with real tools and keeps the evidence. These
terms name the parts of a verification, from the repository setup to the
retained report.

## Language

### Runs and evidence

**Run**:
One verification with a fixed source identity and isolated resources.
_Avoid_: session (a browser session belongs to a seat inside a run)

**Step**:
One recorded CLI operation within a run, including a failed one.

**Attempt**:
One execution of a check. Failed attempts stay in the record.

**Artifact**:
A retained file tied to the step that produced it and to its source identity.

**Evidence folder**:
A Git-ignored directory in the target repository that holds a run's step log,
artifacts and report, and survives cleanup.

**Source identity**:
The commit and working-tree state that a run records when it starts. Evidence
from changed source cannot prove a claim about the recorded source.
_Avoid_: snapshot (`ui snapshot` captures the page state)

**Import root**:
A directory that a profile declares as a safe origin for imported artifacts.

**Mark**:
A named timestamp in a run that later log reads start from.

**Report**:
The offline record of a run: its claims, steps, artifacts, controls, limits
and cleanup. It stays incomplete until each required claim has its proof.

### Plans and results

**Plan**:
The claims, controls, gates and limits that a run must cover, fixed when the
run starts.

**Claim**:
An observable acceptance condition, with its entry point, precondition,
expected result and the checks that supply its evidence.

**Result**:
The operator's record of the outcome and evidence of each claim, control and
gate in a plan.

**Control**:
A deliberate failing attempt and its restored passing attempt, which show that
a check detects the failure it is meant to detect.

**Gate**:
A repository-required check named in the plan. The result records its outcome
and the steps that prove it.

**Limit**:
A stated part of the behavior that a run's evidence does not cover.

**Independent read**:
A step after a side effect completes that reads the result through a separate
path, such as a database read after an API write.

**Inspection**:
The operator's record of what a screenshot shows at a stated viewport,
compared with the expected appearance.

### Repository setup

**Profile**:
The configuration of one target repository: tools, commands, bindings,
seats, checks and evidence rules.

**Lifecycle mode**:
The rule for who starts and stops the target app: `owned` (Spyglass),
`external` (the repository's own tool) or `none` (no persistent target).

**Owner**:
The repository's own tool that starts, checks or cleans up its resources when
the lifecycle mode is `external`.

**Binding**:
A named value that fills a placeholder in a profile for one run, such as a
port or an installation name.

**Seat**:
A named test identity with credential references.

**Check**:
A named, repeatable command or journey in a profile that supplies evidence.
_Avoid_: test (a test is one kind of check)

**Surface**:
A kind of target that Spyglass can drive or observe: repository checks,
commands, the browser, HTTP, PostgreSQL, Docker Compose and imported
evidence.

**Adapter**:
The part of Spyglass that connects one tool to a surface and to the run and
evidence contracts.

**Adapter gap**:
A required behavior that works for a user but that no adapter can drive or
observe.

### People

**Operator**:
The agent or person who selects claims, drives the run and judges the
results.
