export class Fault extends Error {
  code: string;
  next: string;
  exit: number;
  data: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    next: string,
    exit = 2,
    data: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code;
    this.next = next;
    this.exit = exit;
    this.data = data;
  }
}
export function fault(error: unknown): Fault {
  return error instanceof Fault
    ? error
    : new Fault(
        "ENVIRONMENT",
        error instanceof Error ? error.message : String(error),
        "Run spyglass doctor and inspect the retained command output.",
        3,
      );
}
export function requireValue(value: string | undefined, name: string): string {
  if (!value)
    throw new Fault(
      "MISSING_INPUT",
      `Missing ${name}.`,
      `Run spyglass --help for an example with ${name}.`,
    );
  return value;
}
