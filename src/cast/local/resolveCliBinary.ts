/**
 * Resolve the path to the cast CLI binary.
 * Returns the provided binaryPath as-is — callers must supply the full absolute path.
 */
export function resolveCliBinary(input: { binaryPath: string }): string {
  return input.binaryPath;
}
