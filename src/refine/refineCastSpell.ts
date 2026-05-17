import { spellPath } from '../domain/spells/SpellPath';
import { REFINE_SPELL_PATH } from '../domain/spells/SystemSpellPaths';
import type { Spell } from '../domain/spells/Spell';

/**
 * Synthetic Spell-shaped object for routing the Refine cast through CastDispatcher.
 * `path` is the cast-log sentinel (writes '<refine>' to recordCasted).
 * `executeOnNote: true` reflects Refine's invariant: always targets the active note.
 */
export function refineCastSpell(): Spell {
  return {
    name: 'Refine',
    path: spellPath(REFINE_SPELL_PATH),
    executeOnNote: true,
  };
}
