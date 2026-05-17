import type { Spell, Sentinel } from './Spell';

/**
 * Port: a function that ranks spells against a query and appends sentinels.
 * Implementations live in infra (e.g. obsidianRanker).
 * Domain code depends only on this type — never on a concrete ranker.
 */
export type RankSpells = (
  spells: readonly Spell[],
  sentinels: readonly Sentinel[],
  query: string,
) => (Spell | Sentinel)[];
