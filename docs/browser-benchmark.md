# Browser command overhead

Spyglass sends each `ui` command through its own CLI, run state and browser
proxy. This adds time to each browser command. The budget is **150 ms** added
at the median.

## Result

Measured on 2026-10-22, the median added time was **91.7 ms**.

| Measure | Median |
| --- | ---: |
| Direct `agent-browser` | 9.1 ms |
| Through Spyglass | 101.4 ms |
| Added time per pair | 91.7 ms |

One of the 20 pairs was more than 150 ms (163.6 ms, the first pair). Other
local work was active during the test, so some times varied.

## Method

- Node 24.11.1 and `agent-browser` 0.38.2.
- A temporary Git repository and a local HTTP page.
- The same `get title` operation, 20 times through each path, after a warm-up.
- Both paths used the same repository, browser configuration, session,
  allowed host, exact-origin proxy and browser process.
- The direct path ran `agent-browser batch --bail --json`. The Spyglass path
  ran `spyglass ui get title`. Each pair ran the direct command first.
- The times include each new CLI process and the browser command. They do not
  include run setup or app startup.

<details>
<summary>All 20 pairs (milliseconds)</summary>

| Pair | Direct | Spyglass | Added |
| ---: | ---: | ---: | ---: |
| 1 | 14.1 | 177.7 | 163.6 |
| 2 | 10.7 | 111.1 | 100.5 |
| 3 | 9.7 | 111.1 | 101.4 |
| 4 | 9.4 | 140.1 | 130.7 |
| 5 | 31.2 | 152.6 | 121.5 |
| 6 | 9.6 | 109.3 | 99.6 |
| 7 | 8.4 | 98.0 | 89.6 |
| 8 | 9.8 | 101.4 | 91.6 |
| 9 | 8.8 | 141.7 | 132.8 |
| 10 | 9.7 | 112.6 | 102.9 |
| 11 | 9.9 | 99.9 | 89.9 |
| 12 | 8.0 | 99.6 | 91.7 |
| 13 | 9.1 | 93.6 | 84.5 |
| 14 | 7.8 | 91.7 | 83.9 |
| 15 | 8.1 | 89.9 | 81.7 |
| 16 | 8.2 | 89.7 | 81.5 |
| 17 | 7.9 | 88.9 | 81.0 |
| 18 | 8.1 | 86.0 | 78.0 |
| 19 | 7.6 | 89.5 | 81.9 |
| 20 | 9.1 | 116.3 | 107.2 |

</details>

## Changes that reduced the overhead

The first matched measurement added 376.8 ms. These changes reduced it:

| Change | Added time after the change |
| --- | ---: |
| `ui` uses the source baseline that `up` recorded. A healthy proxy uses a nonce health check, not a `ps` lookup. | 218.3 ms |
| Lock metadata records the process ID and start time, not a process identity lookup for each command. | 216.6 ms |
| The CLI loads profile and lifecycle modules only for the commands that need them. (`spyglass --version` cold start: 246.3 ms to 135.3 ms.) | not measured reliably |
| The build uses ESM splitting, with one module for the browser hot path. The browser proxy stays a separate entry point. | 91.7 ms |

Cleanup still checks the identity of the proxy process.

## Reproduce

The browser surface tests check the same browser path. They need
`agent-browser`, Chromium and Docker:

```sh
SPYGLASS_TEST_SURFACES=1 node --test --test-concurrency=1 \
  --test-name-pattern='agent-browser uses a fresh|browser blocks page navigation' \
  tests/e2e/surfaces.test.mjs
```

## Overhead gate

`bench/overhead.mjs` repeats this method as a gate. It needs `agent-browser`,
Chromium and a build (`npm run build`).

```sh
node bench/overhead.mjs
node bench/overhead.mjs --pairs 20 --gate-cold --label after-fastpath
```

The script starts the demo app in a temporary Git repository. It measures:

- the cold start: a new `spyglass --version` process, 20 times;
- each scenario: 20 pairs of the direct `agent-browser batch --bail --json`
  command, then the Spyglass command, on the same run, session, proxy and
  browser. The scenarios are `ui get title` and `ui expect --title`. A scenario
  that this build does not support shows as skipped.

It prints the median (p50) and p95 of the added time for each scenario and
writes `bench/results/overhead-DATE[-LABEL].json`. It exits with status 1 when
the p50 added time is more than 120 ms or the p95 is more than 150 ms. With
`--gate-cold`, it also exits with status 1 when the cold start p50 is more than
100 ms. It exits with status 2 when the measurement itself fails.

