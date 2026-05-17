/**
 * toDisplayPath — Display-time normalisation of vault-relative and absolute paths.
 *
 * Strips the vault-root prefix from absolute paths for display purposes. Serves both
 * new entries (already vault-relative from the writer) and legacy entries (written as
 * absolute paths before writer-side normalisation). Gracefully passes through paths
 * that do not match the vault root.
 *
 * @param rawPath The path as stored in the JSONL record (vault-relative or absolute).
 * @param vaultRootAbs The vault root directory absolute path. Empty string means no normalisation.
 * @returns The normalised path (vault-relative for matching absolute paths, unchanged otherwise).
 */
export function toDisplayPath(rawPath: string, vaultRootAbs: string): string {
  // Empty path: return as-is
  if (rawPath === '') {
    return '';
  }

  // No vault root configured: return raw path unchanged
  if (vaultRootAbs === '') {
    return rawPath;
  }

  // Normalise vault root by stripping any trailing slash
  const normalizedVaultRoot = vaultRootAbs.replace(/\/$/, '');

  // Degenerate case: raw path equals vault root exactly
  if (rawPath === normalizedVaultRoot) {
    return rawPath;
  }

  // If raw path starts with vault root + '/', strip the prefix
  if (rawPath.startsWith(normalizedVaultRoot + '/')) {
    return rawPath.slice(normalizedVaultRoot.length + 1);
  }

  // Path doesn't match vault root: pass through unchanged
  return rawPath;
}
