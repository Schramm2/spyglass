# Await navigation before judging the existing browser control

The [third hosted record](../hosted/41863511029/README.md) preserves a real
surface-test failure separately from accepted report artifacts. Its TAP has
24 passes and one failure: the click returned while the original allowed page
was still current. The test checked the result before navigation completed.
The denied-service counter was zero at that assertion.

The existing E2E check now awaits the same click through the public `--settle`
completion path. Its assertions still require exit 1, `BROWSER_ORIGIN_BLOCKED`
with the denied port, and zero requests at that service. No browser policy,
adapter, production code, timing budget or assertion was changed. The extra
best-effort `get url` after an unexpected success is no longer needed.

`failure-first.json` points to the original failure. `repeats.txt` records
eight independent focused E2E passes; the loop stopped on any failure rather
than retrying failures. `suite.txt` records the full real-tool suite: 114
passes, no failures or skips. Formatting and diff checks also passed. Source,
tests, recipe, workflow and bundle hashes are in `runtime-inputs.json`.
This is local working-tree proof, not a hosted source identity.

`checksums.json` covers these files except itself. The subsequent [closing hosted record](../hosted/41867158951/README.md)
contains successful required CI and all 25 surface checks; prior report
acceptance was not substituted for those checks. No new test file or fixture was added.
