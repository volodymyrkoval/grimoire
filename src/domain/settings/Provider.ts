/**
 * Branded string type for provider identifiers (e.g. 'claude-code').
 * @see ModelId for the sibling brand pattern.
 */
export type Provider = string & { readonly __brand: 'Provider' };

/**
 * Safe constructor for Provider brand.
 */
export function provider(value: string): Provider {
  return value as Provider;
}

/**
 * The built-in Claude Code provider.
 */
export const CLAUDE_CODE: Provider = provider('claude-code');

/**
 * Known providers that are valid in the system.
 */
export const KNOWN_PROVIDERS: readonly Provider[] = [CLAUDE_CODE];

/**
 * Check if a string is a known provider name.
 */
export function isKnownProvider(value: string): boolean {
  return KNOWN_PROVIDERS.some((p) => p === value);
}

/**
 * Parse an unknown value into a Provider, returning null if invalid.
 * - Must be a string
 * - Must match a known provider name
 * - Whitespace is trimmed
 */
export function parseProvider(raw: unknown): Provider | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!isKnownProvider(trimmed)) {
    return null;
  }
  return provider(trimmed);
}
