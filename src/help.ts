const details: Record<
  string,
  { usage: string; description: string; example: string }
> = {
  init: {
    usage: "init [--force]",
    description:
      "Read repository verification guidance and task runners. Write spyglass.json with observed and guessed fields. Review owner setup, guessed readiness and addresses before up. No app starts. --force prints changed fields before replacement.",
    example: "spyglass init --json",
  },
  up: {
    usage:
      "up [--run ID] [--profile PATH] [--binding NAME=VALUE] [--plan FILE]",
    description:
      'Create a run with a fixed source baseline and a pending result template; its output lists resultRules for that template. Evidence must be Git-ignored and unique to the run. owned starts an app; external calls its owner doctor without starting owner resources; none runs checks without a server. Bind only non-secret values. Secret fields use env:, file:, dotenv:path#KEY or op:// references. Direct launch: up --cmd "npm run dev" --ready http://127.0.0.1:3000. Explore without a plan; a complete report requires claims.',
    example:
      "spyglass up --run change-42 --profile spyglass.json --plan verification-plan.json --binding ownerRun=example --json",
  },
  status: {
    usage: "status [--run ID]",
    description:
      "List the runs of every worktree of the repository, or inspect one run: source, active command, completed checks, pending claims, capabilities, owner resources, cleanup, the next command and resultRules, the rules that result enforces for this plan's claims, controls and gates. Inspection works while another operator drives the run. completedChecks names childExitCode (child process) and spyglassExitCode (Spyglass command); exitCode and commandExitCode remain aliases. A run whose worktree was removed shows worktreeRemoved; stop it with down from any worktree.",
    example: "spyglass status --run change-42 --json",
  },
  doctor: {
    usage: "doctor --run ID",
    description:
      "Check immutable source, readiness and the configured owner doctor. Database profiles report role permissions when credentials are available. A writable role is a limit: read-only transactions cannot prevent every function side effect. Diagnostics retain their evidence; a source mismatch never resets the baseline.",
    example: "spyglass doctor --run change-42 --json",
  },
  down: {
    usage: "down --run ID",
    description:
      "Stop only the run-owned app process group and browser sessions. Keep evidence and run records. For external resources, run the profile check with cleanup:true through the owner before the final report. Repeated down is safe.",
    example: "spyglass down --run change-42 --json",
  },
  check: {
    usage:
      "check NAME --run ID [--claim ID] [--independent-read] [--control ID:failed|restored] [--gate NAME]",
    description:
      "Run a profile command with its bindings, environment and deadline. result:exit checks the child exit; result:json requires nonempty valid assertions; result:engine imports the owner journey result. Failed assertions, skips and artifact errors remain failures even when the child exits zero. Declared artifacts must be in allowed import roots. cleanup:true records successful owner cleanup. --claim ID, --independent-read, --control ID:failed|restored and --gate NAME link a step into the pending result; see result.",
    example: "spyglass check verify --run change-42 --json",
  },
  exec: {
    usage:
      "exec [--timeout-ms MILLISECONDS] [--claim ID] [--independent-read] [--control ID:failed|restored] [--gate NAME] --run ID -- COMMAND [ARGUMENTS]",
    description:
      "Run a trusted command as separate arguments and retain output. The default deadline is 300 seconds; --timeout-ms selects an integer from 1 to 86400000 milliseconds. The output limit is 8 MiB. data.exitCode retains the child status; the CLI exits 1 for a failed child. Global options go before --. exec is not a sandbox and command success alone proves only its declared command-level condition. --claim ID, --independent-read, --control ID:failed|restored and --gate NAME link a step into the pending result; see result. Put them before --.",
    example: "spyglass exec --run change-42 --json -- npm test",
  },
  api: {
    usage:
      "api METHOD PATH --run ID [--seat NAME] [--data JSON|@FILE] [--expect STATUS] [--expect-json PATH=VALUE] [--expect-body-contains TEXT] [--wait-until PATH=VALUE [--fail-on PATH=VALUE] [--timeout-ms MS] [--interval-ms MS]] [--claim ID] [--independent-read]",
    description:
      "Request a path relative to profile.api. A named seat resolves its token reference privately. Requests stay on the configured origin; redirects are retained but not followed. Invalid JSON is rejected before sending. Save the masked request and response, print a short body, and compare --expect when given. HTTP 202 means accepted, not completed: wait for completion and then make a separate read. --expect-json PATH=VALUE (or PATH!=VALUE) checks a field of the JSON body; a dotted PATH reaches objects, array indexes and length, for example items.length=3, and a path that is not in the body fails both forms. --expect-body-contains TEXT checks the raw body. Each check is an assertion of the step; a failed one exits 1 with API_EXPECTATION_FAILED and keeps the masked response. --wait-until PATH=VALUE polls a GET or HEAD until the field has the value; --fail-on PATH=VALUE stops the poll at a failed state; --timeout-ms (default 15000, up to 120000) and --interval-ms (default 250, from 50) bound it. The poll count, the elapsed time and the final response stay in api-response.json. A poll that times out or reaches a fail state fails the step, so it cannot be an independent read. Keep raw credentials out of argv. --claim ID, --independent-read, --control ID:failed|restored and --gate NAME link a step into the pending result; see result.",
    example:
      "spyglass api GET /jobs/123 --run change-42 --seat member --expect 200 --json",
  },
  db: {
    usage:
      "db SQL --run ID [--expect-rows N | --expect-empty] [--expect-col COLUMN=VALUE] [--claim ID] [--independent-read]",
    description:
      "Run one PostgreSQL statement through the extended protocol in a read-only transaction. profile.db.connection must be a secret reference. Retained results are bounded to 1,000 rows and 1 MiB; overflow is a failed check. No psql meta-commands. --expect-col COLUMN=VALUE (or COLUMN!=VALUE, repeatable) checks a value in the first row; a dotted name reaches into a JSON column. --expect-empty is --expect-rows 0. Each check is an assertion in database-result.json; a failed column check exits 1 with DATABASE_EXPECTATION_FAILED and keeps the bounded result. The role inspection is read once per run, by doctor or the first query, and reused for the same connection; doctor reads it again. Role warnings describe remaining function-side-effect limits. Use the owner database; this command creates no server. --claim ID, --independent-read, --control ID:failed|restored and --gate NAME link a step into the pending result; see result.",
    example:
      'spyglass db "SELECT 42 AS answer" --run change-42 --expect-rows 1 --json',
  },
  ps: {
    usage: "ps --run ID [--wait [--timeout-ms MS]]",
    description:
      "Inspect only profile.compose.project with its declared files. Print container state and health. A required service that is not running fails; a container with a health check is ready only when it is healthy, so starting and unhealthy fail too. --wait polls every 500 ms until each required service is ready or --timeout-ms (default 30000, up to 600000) ends, and keeps the last list, the poll count and the elapsed time. This command changes no container.",
    example: "spyglass ps --run change-42 --json",
  },
  mark: {
    usage: "mark LABEL --run ID",
    description:
      "Save a timestamp in this run for later process or Compose log inspection.",
    example: "spyglass mark before-action --run change-42 --json",
  },
  logs: {
    usage:
      "logs [SERVICE] (--since MARK | --since-step STEP_ID | --since-last) [--grep PATTERN] [--expect-text TEXT] [--forbid-text TEXT] --run ID",
    description:
      "Read retained app logs or the declared Compose project since an existing mark. Save masked evidence. Missing marks fail and list the known marks. --since-step STEP_ID starts at that step's start time and needs no mark; an unknown step fails with UNKNOWN_STEP. --since-last starts at the previous step. --grep PATTERN keeps the lines that match a regular expression. --expect-text TEXT and --forbid-text TEXT (repeatable) check the kept log; a failed one exits 1 with LOG_EXPECTATION_FAILED and keeps the log artifact. Diagnostics remain available after a drive fails.",
    example: "spyglass logs app --since before-action --run change-42 --json",
  },
  evidence: {
    usage: "evidence add --step STEP_ID --file PATH --run ID [--claim ID]",
    description:
      "Copy a regular file from the evidence folder or a profile.imports root. Retain its checksum and producing-step reference. Original files remain unchanged. Reject unsafe paths, symlinks and unsupported formats. Use named-check artifact declarations for normal check output. --claim ID links the evidence step and STEP_ID into the pending result.",
    example:
      "spyglass evidence add --step 123456 --file runs/owner/result.json --run change-42 --json",
  },
  result: {
    usage:
      "result [--file PATH] [--check] --run ID | result set --claim ID|--gate NAME|--control ID OPTIONS --run ID",
    description:
      "Validate and record the result. Without --file, read the pending result of the run; up prints its path. Validate claim IDs, cited steps and artifacts, visual inspection, independent reads, gates and predeclared negative controls. Every finding is in data.findings at once, and each finding has a repair: the next action that clears it. --check applies the same rules and records nothing. Spyglass refuses to record a result that has a blocking finding. For multiple viewports use inspections with viewport, expected, observed and artifact for each cited screenshot. The single inspection remains supported. Controls include failedRun; replace its current run ID when the failure belongs to an earlier run, also one from another worktree of the repository. Keep that worktree until the report. A gate can name run, another run with the same source identity and profile whose steps prove it; it fails when its step used a binding with another value. status and up list the rules for this plan in resultRules. Use spyglass schema result for the full shape. Recording a result does not complete cleanup or certify semantic coverage. LINKING: --claim ID adds a passing step and its artifacts to claim ID in the pending result. --independent-read also sets the later read of a side-effect claim. --control ID:failed sets failedStep; --control ID:restored sets restoredStep and cites it in the control claim. --gate NAME adds a passing step and sets the gate outcome to passed; a failed step sets failed. A failed step is not cited by a claim. Linking never writes observed, an inspection observed text or a claim outcome. result set writes them from flags: --claim ID --outcome passed --observed TEXT [--step ID] [--artifact PATH] [--independent-read STEP] [--reason TEXT] [--inspect VIEWPORT:ARTIFACT --expected TEXT --observed TEXT]; --gate NAME --outcome passed [--step ID]; --control ID --observed-failure TEXT --observed-pass TEXT [--failed-run RUN] [--failed-step ID] [--restored-step ID]; --operator agent|human; --limit TEXT. An --observed after --inspect belongs to that inspection.",
    example: "spyglass result --check --run change-42 --json",
  },
  report: {
    usage: "report --run ID",
    description:
      "Write retained offline HTML and JSON from the run log, recorded result, source and artifact checksums. Only a result recorded with spyglass result counts. data.reportPath is the absolute path of the HTML page. Works after cleanup without contacting the app. Missing claims, controls, required gates, cleanup, altered evidence or source changes produce a diagnostic report and exit 1. Prior failed attempts remain visible.",
    example: "spyglass report --run change-42 --json",
  },
  schema: {
    usage: "schema profile|plan|result",
    description:
      "Print the version 1 JSON schema without a repository or run. --json wraps it in the standard result envelope.",
    example: "spyglass schema profile --json",
  },
};
export function commandHelp(name: string): string | undefined {
  const d = details[name];
  return d
    ? `Usage: spyglass ${d.usage}\n\n${d.description}\n\nExample: ${d.example}\n\nOptions: --json, --help. Run selection: --run ID or SPYGLASS_RUN.\nExit codes: 0 success; 1 failed verification; 2 invalid input; 3 environment failure.`
    : undefined;
}
