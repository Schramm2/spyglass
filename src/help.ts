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
      'Create a run with a fixed source baseline and a pending result template. Evidence must be Git-ignored and unique to the run. owned starts an app; external calls its owner doctor without starting owner resources; none runs checks without a server. Bind only non-secret values. Secret fields use env:, file:, dotenv:path#KEY or op:// references. Direct launch: up --cmd "npm run dev" --ready http://127.0.0.1:3000. Explore without a plan; a complete report requires claims.',
    example:
      "spyglass up --run change-42 --profile spyglass.json --plan verification-plan.json --binding ownerRun=example --json",
  },
  status: {
    usage: "status [--run ID]",
    description:
      "List the runs of every worktree of the repository, or inspect one run: source, active command, completed checks, pending claims, capabilities, owner resources, cleanup and the next command. Inspection works while another operator drives the run. completedChecks names childExitCode (child process) and spyglassExitCode (Spyglass command); exitCode and commandExitCode remain aliases. A run whose worktree was removed shows worktreeRemoved; stop it with down from any worktree.",
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
    usage: "check NAME --run ID",
    description:
      "Run a profile command with its bindings, environment and deadline. result:exit checks the child exit; result:json requires nonempty valid assertions; result:engine imports the owner journey result. Failed assertions, skips and artifact errors remain failures even when the child exits zero. Declared artifacts must be in allowed import roots. cleanup:true records successful owner cleanup.",
    example: "spyglass check verify --run change-42 --json",
  },
  exec: {
    usage: "exec [--timeout-ms MILLISECONDS] --run ID -- COMMAND [ARGUMENTS]",
    description:
      "Run a trusted command as separate arguments and retain output. The default deadline is 300 seconds; --timeout-ms selects an integer from 1 to 86400000 milliseconds. The output limit is 8 MiB. data.exitCode retains the child status; the CLI exits 1 for a failed child. Global options go before --. exec is not a sandbox and command success alone proves only its declared command-level condition.",
    example: "spyglass exec --run change-42 --json -- npm test",
  },
  api: {
    usage:
      "api METHOD PATH --run ID [--seat NAME] [--data JSON|@FILE] [--expect STATUS]",
    description:
      "Request a path relative to profile.api. A named seat resolves its token reference privately. Requests stay on the configured origin; redirects are retained but not followed. Invalid JSON is rejected before sending. Save the masked request and response, print a short body, and compare --expect when given. HTTP 202 means accepted, not completed: wait for completion and then make a separate read. Keep raw credentials out of argv.",
    example:
      "spyglass api GET /jobs/123 --run change-42 --seat member --expect 200 --json",
  },
  db: {
    usage: "db SQL --run ID [--expect-rows N]",
    description:
      "Run one PostgreSQL statement through the extended protocol in a read-only transaction. profile.db.connection must be a secret reference. Retained results are bounded to 1,000 rows and 1 MiB; overflow is a failed check. No psql meta-commands. Role warnings describe remaining function-side-effect limits. Use the owner database; this command creates no server.",
    example:
      'spyglass db "SELECT 42 AS answer" --run change-42 --expect-rows 1 --json',
  },
  ps: {
    usage: "ps --run ID",
    description:
      "Inspect only profile.compose.project with its declared files. Print container state and health. A required service that is not running fails; this command changes no container.",
    example: "spyglass ps --run change-42 --json",
  },
  mark: {
    usage: "mark LABEL --run ID",
    description:
      "Save a timestamp in this run for later process or Compose log inspection.",
    example: "spyglass mark before-action --run change-42 --json",
  },
  logs: {
    usage: "logs [SERVICE] --since MARK --run ID",
    description:
      "Read retained app logs or the declared Compose project since an existing mark. Save masked evidence. Missing marks fail and list the known marks. Diagnostics remain available after a drive fails.",
    example: "spyglass logs app --since before-action --run change-42 --json",
  },
  evidence: {
    usage: "evidence add --step STEP_ID --file PATH --run ID",
    description:
      "Copy a regular file from the evidence folder or a profile.imports root. Retain its checksum and producing-step reference. Original files remain unchanged. Reject unsafe paths, symlinks and unsupported formats. Use named-check artifact declarations for normal check output.",
    example:
      "spyglass evidence add --step 123456 --file runs/owner/result.json --run change-42 --json",
  },
  result: {
    usage: "result --file PATH --run ID",
    description:
      "Read the edited result template printed by up. Validate claim IDs, cited steps and artifacts, visual inspection, independent reads, gates and predeclared negative controls. For multiple viewports use inspections with viewport, expected, observed and artifact for each cited screenshot. The single inspection remains supported. Controls include failedRun; replace its current run ID when the failure belongs to an earlier run, also one from another worktree of the repository. Keep that worktree until the report. A gate can name run, another run with the same source identity and profile whose steps prove it; it fails when its step used a binding with another value. status and up list the rules for this plan in resultRules. Use spyglass schema result for the full shape. Recording a result does not complete cleanup or certify semantic coverage.",
    example:
      "spyglass result --file .spyglass/runs/change-42/spyglass/result.json --run change-42 --json",
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
