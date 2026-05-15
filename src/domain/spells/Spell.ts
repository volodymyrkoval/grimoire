import type { SpellPath } from './SpellPath';
import { spellPath } from './SpellPath';

/** Frontmatter key that controls whether a spell auto-executes when opened. */
export const EXECUTE_ON_NOTE_KEY = 'grimoire-execute-on-note';

/** Reserved synthetic SpellPath for the built-in Refine sentinel's per-spell overrides.
 *  Angle-bracketed prefix is impossible in real vault paths, preventing collision. */
export const REFINE_SENTINEL_PATH: SpellPath = spellPath('<grimoire-sentinel:refine>');

/** A castable spell sourced from a vault note with a grimoire tag. */
export interface Spell {
  readonly name: string;
  readonly path: SpellPath;
  readonly executeOnNote: boolean;
}

/** Action sentinels that appear in the spell list (forge, refine) or layout (separators). */
export type SentinelKind = "forge" | "refine" | "separator";

/** A UI sentinel — not a spell, but an action or visual break in the spell list. */
export interface Sentinel {
  readonly kind: SentinelKind;
  readonly name: string;
}

/** Type guard — returns `true` when `item` is a `Sentinel` (has a `kind` field). */
export function isSentinel(item: Spell | Sentinel): item is Sentinel {
  return "kind" in item;
}

