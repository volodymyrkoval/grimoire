import type { SpellPath } from './SpellPath';

export const EXECUTE_ON_NOTE_KEY = 'grimoire-execute-on-note';

export interface Spell {
  readonly name: string;
  readonly path: SpellPath;
  readonly executeOnNote: boolean;
}

export type SentinelKind = "forge" | "refine" | "separator";

export interface Sentinel {
  readonly kind: SentinelKind;
  readonly name: string;
}

/** Type guard — returns `true` when `item` is a `Sentinel` (has a `kind` field). */
export function isSentinel(item: Spell | Sentinel): item is Sentinel {
  return "kind" in item;
}
