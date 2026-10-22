# Spyglass terms

- **Run:** one verification session with a fixed source baseline and isolated resources.
- **Profile:** repository configuration for tools, commands, bindings and evidence.
- **Seat:** a named test identity with credential references.
- **Claim:** an observable acceptance condition.
- **Check:** a repeatable command or journey that supplies evidence.
- **Attempt:** one execution of a check; failed attempts stay in the record.
- **Step:** one recorded CLI operation within a run.
- **Artifact:** a retained file tied to its producing step and source.
- **Evidence folder:** a Git-ignored directory that survives cleanup.
- **Adapter:** code that connects a tool to run and evidence contracts.
- **Operator:** the agent or person who selects claims and judges results.
