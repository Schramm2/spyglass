# M2 retained evidence

Read [the adoption record](../../../docs/adoption-m2.md) for the protocol,
source/build identities, timings, repairs, assistance and limits. Agent use
only; human use is untested. These files are retained in the repository, not
only at temporary machine paths.

## Reports

- Baseline library: `library/run/56617505-e25-1-index.html`.
- Baseline web/external lifecycle: `web/run/spyglass/f43811af-7f8-1-index.html`.
- Fresh delivered-candidate adoption: `final-adoption/pass/02810391-236-1-index.html`.
- Guided packaging retest: `guided-packaging/pass/eaa422f0-879-1-index.html`.

Each passing report has its summary, source identity, intended failure,
restored pass and cleanup. The isarray fault reports remain incomplete by
design; the candidate cites their failed steps. `final-adoption/fault/` and
`guided-packaging/fault/` keep those records separately.

Open the HTML directly without a server or target app. The coordinator also
opened the guided report in a real browser from a local file: no network
request or page error occurred. `checks/report-offline.png` was opened and
inspected; it shows the passed claim and candidate source identity.

## Integrity and checks

`evidence-audit.json` independently checks all 50 produced-artifact references
from the six retained run logs. Run artifacts are byte-exact copies, not
sanitized replacements. Retention indexes were regenerated after adding the
complete logs and result files; they are metadata, not cited run artifacts.

From this directory, verify the retained set with:

```sh
shasum -a 256 -c SHA256SUMS
```

`checks/` keeps pre-implementation failures, the restored checks, the full
core/surface outputs, formatting output, and opened browser screenshots.
Diagnostic source-checkout paths and local private-plan file names in TAP
are replaced with placeholders. That text is a sanitized diagnostic copy;
it is not an original run artifact. Operator command excerpts use `.txt`
extensions so repository-wide `*.log` ignore rules do not hide the retained
proof; their bytes are unchanged. The copied operator report's file references
were updated to those retained names.

The original baseline package included private local plans and is not part
of this evidence. Raw operator histories, temporary source copies, browser
state, package archives and credentials are not included. Some earlier setup
failures remain only in the operators' local histories; the detailed reports
state that retention limit. No image is offered as a semantic verdict unless
an operator opened it.
