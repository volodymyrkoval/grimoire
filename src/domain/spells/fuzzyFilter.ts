import { prepareFuzzySearch, sortSearchResults } from 'obsidian';
import type { Sentinel, Spell } from './Spell';

export function fuzzyFilter(
  spells: readonly Spell[],
  sentinels: readonly Sentinel[],
  query: string
): (Spell | Sentinel)[] {
  if (query.trim() === '') {
    return [...spells, ...sentinels];
  }

  const m = prepareFuzzySearch(query);
  const scored = spells
    .map((spell) => ({ spell, match: m(spell.name) }))
    .filter(
      (entry): entry is { spell: Spell; match: NonNullable<typeof entry.match> } =>
        entry.match !== null
    );
  sortSearchResults(scored);
  return [...scored.map((e) => e.spell), ...sentinels];
}
