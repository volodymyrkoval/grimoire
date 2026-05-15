/**
 * Resolve the path to the cast CLI binary.
 * Prefers an explicit binary path; falls back to the CLI command name for PATH resolution.
 */
export function resolveCliBinary(input: {
  binaryPath: string;
  cliCommand: string;
}): string {
  return input.binaryPath || input.cliCommand;
}
