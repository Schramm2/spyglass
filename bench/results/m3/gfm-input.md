# Spyglass review

Status: passed
Run: ci-passed-1793805214929-1
Source commit: 522bec2295256069e208fa2c612ad1c0889e66d7
Source fingerprint: 2ca10b3c154b2db2b07df5460a047390ced8c0f57098033b17fd083567debe84
Current fingerprint: 2ca10b3c154b2db2b07df5460a047390ced8c0f57098033b17fd083567debe84

This summary records this run only. Workflow provenance identifies CI proof; local proof is separate.
Open the offline HTML report for attempts and artifacts. A passed claim does not prove behavior outside its plan.

## Claims
- fixture-ready: passed — &#60;script&#62;alert&#40;1&#41;&#60;/script&#62; &#35; forged heading &#33;&#91;image&#93;&#40;https&#58;//example&#46;invalid/a&#46;png&#41; https&#58;//example&#46;invalid www&#46;example&#46;invalid user&#64;<!-- -->example&#46;invalid
  Expected: The unchanged fixture-ready assertion passes after the fault is removed&#46;
  Observed: The unchanged fixture-ready assertion passed after the fault marker was removed&#46;
  Steps: 8506948c-ad9
  Artifacts: 8506948c-ad9-1-verify-output&#46;txt

## Controls
- detect-fault: passed — The same assertion fails with the fault marker and passes without it&#46;
  Assertion: fixture-ready
  Intended failure: run ci-passed-1793805214929-1, step 7cb81a3b-b0c — The fixture-ready assertion was false with the marker present&#46;
  Restored pass: step 8506948c-ad9 — The same assertion was true after removal&#46;
  Recorded attempt (not validated control proof): failed, step 7cb81a3b-b0c, status failed
  Recorded attempt (not validated control proof): restored, step 8506948c-ad9, status passed

## Gates
- verify: passed — run ci-passed-1793805214929-1, steps 8506948c-ad9

## Cleanup
- Run state: stopped
- Spyglass resources cleaned: true
- External owner cleaned: not required

## Limits
- Scripted public fixture proof only; no agent speed, browser, database or human-usability claim&#46;
- The ignored marker is an environment control, not a product-source mutation&#46;

## Findings
- None.
