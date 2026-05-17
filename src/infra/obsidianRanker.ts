import { prepareFuzzySearch, sortSearchResults } from 'obsidian';
import type { RankSpells } from '../domain/spells/RankSpells';

/**
 * Infra adapter: implements RankSpells using Obsidian's fuzzy-search API.
 * Injected into SpellsPanel at composition time (PopupModule).
 */
export const obsidianRanker: RankSpells = (spells, sentinels, query) => {
  if (query.trim() === '') {
    return [...spells, ...sentinels];
  }

  const m = prepareFuzzySearch(query);
  const scored = spells
    .map((spell) => ({ spell, match: m(spell.name) }))
    .filter(
      (entry): entry is { spell: typeof entry.spell; match: NonNullable<typeof entry.match> } =>
        entry.match !== null
    );
  sortSearchResults(scored);
  return [...scored.map((e) => e.spell), ...sentinels];
};
