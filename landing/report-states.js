// Real output of `spyglass report --json` and `spyglass result --json` for the
// terminal quickstart demo, recorded once for each state the showcase offers.
// Keys: result|source|cleanup.
window.SPYGLASS_REPORT_STATES = {
  "none|recorded|pending": {
    command: "report",
    exit: 1,
    status: "incomplete",
    findings: [
      {
        code: "RESULT_MISSING",
        message:
          "No result has been recorded for this run. Submit it with spyglass result --file PATH.",
      },
      {
        code: "CLEANUP_PENDING",
        message:
          "Spyglass-owned resources have not been cleaned up successfully.",
      },
      {
        code: "CONTROL_INCOMPLETE",
        message:
          "Required negative control failure-detection has no failed-then-restored result.",
      },
    ],
    environment: [
      {
        name: "source identity",
        status: "passed",
        detail: "Current source matches the baseline recorded at up.",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "4 of 4 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "pending",
        detail: "Spyglass cleanup: false; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "not run",
      steps: [],
      observed: "",
      artifacts: [],
    },
  },
  "none|edited|pending": {
    command: "report",
    exit: 1,
    status: "incomplete",
    findings: [
      {
        code: "RESULT_MISSING",
        message:
          "No result has been recorded for this run. Submit it with spyglass result --file PATH.",
      },
      {
        code: "STALE_SOURCE",
        message: "Source changed since up: fixtures/demo-app/server.mjs.",
      },
      {
        code: "CLEANUP_PENDING",
        message:
          "Spyglass-owned resources have not been cleaned up successfully.",
      },
      {
        code: "CONTROL_INCOMPLETE",
        message:
          "Required negative control failure-detection has no failed-then-restored result.",
      },
    ],
    environment: [
      {
        name: "source identity",
        status: "failed",
        detail: "Changed inputs: fixtures/demo-app/server.mjs",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "6 of 6 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "pending",
        detail: "Spyglass cleanup: false; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "not run",
      steps: [],
      observed: "",
      artifacts: [],
    },
  },
  "failed|recorded|pending": {
    command: "result",
    exit: 1,
    error: {
      code: "PROOF_INCOMPLETE",
      message: "Claim health-ready has no successful cited step.",
      next: "Record a successful step and its retained evidence, inspect visual evidence when required, then submit the result again.",
    },
    findings: [
      {
        code: "FAILED_STEP",
        message: "Claim health-ready has no successful cited step.",
      },
      {
        code: "FAILED_ASSERTION",
        message:
          "Claim health-ready cites a failed assertion or skipped check.",
      },
      {
        code: "NAMED_CHECK_MISSING",
        message:
          "Claim health-ready has no recorded attempt for required check health.",
      },
      {
        code: "BEHAVIOR_PROOF_MISSING",
        message:
          "Behavior claim health-ready cites no successful behavior check; cleanup and administrative steps cannot prove application behavior.",
      },
      {
        code: "CONTROL_INVALID",
        message:
          "Negative control failure-detection is invalid: claim health-ready does not cite the restored passing step.",
      },
    ],
  },
  "failed|edited|pending": {
    command: "result",
    exit: 1,
    error: {
      code: "PROOF_INCOMPLETE",
      message: "Claim health-ready has no successful cited step.",
      next: "Record a successful step and its retained evidence, inspect visual evidence when required, then submit the result again.",
    },
    findings: [
      {
        code: "FAILED_STEP",
        message: "Claim health-ready has no successful cited step.",
      },
      {
        code: "FAILED_ASSERTION",
        message:
          "Claim health-ready cites a failed assertion or skipped check.",
      },
      {
        code: "NAMED_CHECK_MISSING",
        message:
          "Claim health-ready has no recorded attempt for required check health.",
      },
      {
        code: "BEHAVIOR_PROOF_MISSING",
        message:
          "Behavior claim health-ready cites no successful behavior check; cleanup and administrative steps cannot prove application behavior.",
      },
      {
        code: "CONTROL_INVALID",
        message:
          "Negative control failure-detection is invalid: claim health-ready does not cite the restored passing step.",
      },
    ],
  },
  "passed|recorded|pending": {
    command: "report",
    exit: 1,
    status: "incomplete",
    findings: [
      {
        code: "CLEANUP_PENDING",
        message:
          "Spyglass-owned resources have not been cleaned up successfully.",
      },
    ],
    environment: [
      {
        name: "source identity",
        status: "passed",
        detail: "Current source matches the baseline recorded at up.",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "8 of 8 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "pending",
        detail: "Spyglass cleanup: false; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "passed",
      steps: ["f36e92eb-a94"],
      observed: "GET /health returned HTTP 200 with status ok.",
      artifacts: ["f36e92eb-a94-1-health-output.txt"],
    },
  },
  "passed|edited|pending": {
    command: "report",
    exit: 1,
    status: "incomplete",
    findings: [
      {
        code: "STALE_SOURCE",
        message: "Source changed since up: fixtures/demo-app/server.mjs.",
      },
      {
        code: "CLEANUP_PENDING",
        message:
          "Spyglass-owned resources have not been cleaned up successfully.",
      },
    ],
    environment: [
      {
        name: "source identity",
        status: "failed",
        detail: "Changed inputs: fixtures/demo-app/server.mjs",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "10 of 10 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "pending",
        detail: "Spyglass cleanup: false; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "passed",
      steps: ["f36e92eb-a94"],
      observed: "GET /health returned HTTP 200 with status ok.",
      artifacts: ["f36e92eb-a94-1-health-output.txt"],
    },
  },
  "none|recorded|done": {
    command: "report",
    exit: 1,
    status: "incomplete",
    findings: [
      {
        code: "RESULT_MISSING",
        message:
          "No result has been recorded for this run. Submit it with spyglass result --file PATH.",
      },
      {
        code: "CONTROL_INCOMPLETE",
        message:
          "Required negative control failure-detection has no failed-then-restored result.",
      },
    ],
    environment: [
      {
        name: "source identity",
        status: "passed",
        detail: "Current source matches the baseline recorded at up.",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "5 of 5 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "passed",
        detail: "Spyglass cleanup: true; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "not run",
      steps: [],
      observed: "",
      artifacts: [],
    },
  },
  "none|edited|done": {
    command: "report",
    exit: 1,
    status: "incomplete",
    findings: [
      {
        code: "RESULT_MISSING",
        message:
          "No result has been recorded for this run. Submit it with spyglass result --file PATH.",
      },
      {
        code: "STALE_SOURCE",
        message: "Source changed since up: fixtures/demo-app/server.mjs.",
      },
      {
        code: "CONTROL_INCOMPLETE",
        message:
          "Required negative control failure-detection has no failed-then-restored result.",
      },
    ],
    environment: [
      {
        name: "source identity",
        status: "failed",
        detail: "Changed inputs: fixtures/demo-app/server.mjs",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "7 of 7 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "passed",
        detail: "Spyglass cleanup: true; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "not run",
      steps: [],
      observed: "",
      artifacts: [],
    },
  },
  "failed|recorded|done": {
    command: "result",
    exit: 1,
    error: {
      code: "PROOF_INCOMPLETE",
      message: "Claim health-ready has no successful cited step.",
      next: "Record a successful step and its retained evidence, inspect visual evidence when required, then submit the result again.",
    },
    findings: [
      {
        code: "FAILED_STEP",
        message: "Claim health-ready has no successful cited step.",
      },
      {
        code: "FAILED_ASSERTION",
        message:
          "Claim health-ready cites a failed assertion or skipped check.",
      },
      {
        code: "NAMED_CHECK_MISSING",
        message:
          "Claim health-ready has no recorded attempt for required check health.",
      },
      {
        code: "BEHAVIOR_PROOF_MISSING",
        message:
          "Behavior claim health-ready cites no successful behavior check; cleanup and administrative steps cannot prove application behavior.",
      },
      {
        code: "CONTROL_INVALID",
        message:
          "Negative control failure-detection is invalid: claim health-ready does not cite the restored passing step.",
      },
    ],
  },
  "failed|edited|done": {
    command: "result",
    exit: 1,
    error: {
      code: "PROOF_INCOMPLETE",
      message: "Claim health-ready has no successful cited step.",
      next: "Record a successful step and its retained evidence, inspect visual evidence when required, then submit the result again.",
    },
    findings: [
      {
        code: "FAILED_STEP",
        message: "Claim health-ready has no successful cited step.",
      },
      {
        code: "FAILED_ASSERTION",
        message:
          "Claim health-ready cites a failed assertion or skipped check.",
      },
      {
        code: "NAMED_CHECK_MISSING",
        message:
          "Claim health-ready has no recorded attempt for required check health.",
      },
      {
        code: "BEHAVIOR_PROOF_MISSING",
        message:
          "Behavior claim health-ready cites no successful behavior check; cleanup and administrative steps cannot prove application behavior.",
      },
      {
        code: "CONTROL_INVALID",
        message:
          "Negative control failure-detection is invalid: claim health-ready does not cite the restored passing step.",
      },
    ],
  },
  "passed|recorded|done": {
    command: "report",
    exit: 0,
    status: "passed",
    findings: [],
    environment: [
      {
        name: "source identity",
        status: "passed",
        detail: "Current source matches the baseline recorded at up.",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "9 of 9 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "passed",
        detail: "Spyglass cleanup: true; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "passed",
      steps: ["e596a812-f93"],
      observed: "GET /health returned HTTP 200 with status ok.",
      artifacts: ["e596a812-f93-1-health-output.txt"],
    },
  },
  "passed|edited|done": {
    command: "report",
    exit: 1,
    status: "incomplete",
    findings: [
      {
        code: "STALE_SOURCE",
        message: "Source changed since up: fixtures/demo-app/server.mjs.",
      },
    ],
    environment: [
      {
        name: "source identity",
        status: "failed",
        detail: "Changed inputs: fixtures/demo-app/server.mjs",
      },
      {
        name: "artifact integrity",
        status: "passed",
        detail: "11 of 11 recorded artifacts match their checksums.",
      },
      {
        name: "cleanup",
        status: "passed",
        detail: "Spyglass cleanup: true; external owner cleanup: true.",
      },
    ],
    claim: {
      id: "health-ready",
      outcome: "passed",
      steps: ["e596a812-f93"],
      observed: "GET /health returned HTTP 200 with status ok.",
      artifacts: ["e596a812-f93-1-health-output.txt"],
    },
  },
};
