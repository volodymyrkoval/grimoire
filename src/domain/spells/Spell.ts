import type { SpellPath } from './SpellPath';

export interface Spell {
  readonly name: string;
  readonly path: SpellPath;
}

export type SentinelKind = "forge" | "refine" | "separator";

export interface Sentinel {
  readonly kind: SentinelKind;
  readonly name: string;
}

export function isSentinel(item: Spell | Sentinel): item is Sentinel {
  return "kind" in item;
}
