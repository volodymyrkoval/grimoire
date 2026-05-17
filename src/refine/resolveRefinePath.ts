/**
 * ResolvedRefinePath describes the outcome of refine path resolution,
 * including whether the result fell back to the bundled default and why.
 */
export interface ResolvedRefinePath {
  readonly path: string;
  readonly isFallback: boolean;
  readonly fallbackReason?: 'missing' | 'unreadable' | 'sentinel-removed';
}

/**
 * ResolveRefinePathInput provides the context for deciding which refine prompt to use.
 *
 * @param perCast - per-cast override (undefined = no choice, null = explicit Default, string = a specific vault path)
 * @param settingsActive - fallback when perCast is undefined
 * @param bundledDefaultVaultRel - vault-relative path to the built-in refine template
 * @param isSentinel - callback to check if a vault-relative path points to a valid/marked refine sentinel file
 */
export interface ResolveRefinePathInput {
  perCast: string | null | undefined;
  settingsActive: string | null;
  bundledDefaultVaultRel: string;
  isSentinel: (vaultRelPath: string) => boolean;
}

/**
 * resolveRefinePath cascades through per-cast choice, settings choice, and the bundled default
 * to determine which refine prompt file to use.
 *
 * Cascade:
 * 1. If perCast is undefined → skip to settings (step 4)
 * 2. If perCast is null → return bundled default (explicit "Default")
 * 3. If perCast is a string:
 *    - If isSentinel(perCast) → return perCast (user's choice is valid)
 *    - Else → return bundled, isFallback=true (sentinel was removed/lost)
 * 4. Settings step (only reached when perCast undefined):
 *    - If settingsActive is null → return bundled default
 *    - Else if isSentinel(settingsActive) → return settingsActive
 *    - Else → return bundled, isFallback=true (sentinel was removed/lost)
 */
export function resolveRefinePath(input: ResolveRefinePathInput): ResolvedRefinePath {
  const { perCast, settingsActive, bundledDefaultVaultRel, isSentinel } = input;

  // Step 1–3: Handle perCast if defined
  if (perCast !== undefined) {
    if (perCast === null) {
      // Explicit "Default (built-in)"
      return { path: bundledDefaultVaultRel, isFallback: false };
    }
    // perCast is a string
    if (isSentinel(perCast)) {
      return { path: perCast, isFallback: false };
    }
    // Sentinel was removed/lost
    return {
      path: bundledDefaultVaultRel,
      isFallback: true,
      fallbackReason: 'sentinel-removed',
    };
  }

  // Step 4: Settings step (only reached when perCast is undefined)
  if (settingsActive === null) {
    return { path: bundledDefaultVaultRel, isFallback: false };
  }
  // settingsActive is a string
  if (isSentinel(settingsActive)) {
    return { path: settingsActive, isFallback: false };
  }
  // Sentinel was removed/lost
  return {
    path: bundledDefaultVaultRel,
    isFallback: true,
    fallbackReason: 'sentinel-removed',
  };
}
