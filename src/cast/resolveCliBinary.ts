export function resolveCliBinary(input: {
  binaryPath: string;
  cliCommand: string;
}): string {
  return input.binaryPath || input.cliCommand;
}
