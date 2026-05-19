/** Branded type for a validated one or two character lowercase ASCII hotkey. */
export type Hotkey = string & { __brand: 'Hotkey' };

/** Frontmatter key for spell hotkeys. */
export const HOTKEY_FRONTMATTER_KEY = 'grimoire-hotkey' as const;

/**
 * Parses a raw value into a Hotkey if it matches the pattern ^[a-z]{1,2}$.
 * Returns null for any non-matching input, including non-strings.
 */
export function parseHotkey(raw: unknown): Hotkey | null {
  if (typeof raw !== 'string') {
    return null;
  }
  if (!/^[a-z]{1,2}$/.test(raw)) {
    return null;
  }
  return raw as Hotkey;
}

/** Sentinel hotkeys: hard-coded defaults for Forge and Refine sentinels. */
export const SENTINEL_HOTKEYS = {
  forge: parseHotkey('f')!,
  refine: parseHotkey('r')!,
} as const;
