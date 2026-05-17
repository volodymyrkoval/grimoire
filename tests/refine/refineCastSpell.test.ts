import { describe, it, expect } from 'vitest';
import { refineCastSpell } from '../../src/refine/refineCastSpell';
import { REFINE_SPELL_PATH } from '../../src/domain/spells/SystemSpellPaths';
import { spellPath } from '../../src/domain/spells/SpellPath';

describe('refineCastSpell', () => {
  it('returns a Spell with name "Refine"', () => {
    const spell = refineCastSpell();
    expect(spell.name).toBe('Refine');
  });

  it('returns a Spell with path set to REFINE_SPELL_PATH sentinel', () => {
    const spell = refineCastSpell();
    expect(spell.path).toBe(spellPath(REFINE_SPELL_PATH));
  });

  it('returns a Spell with executeOnNote=true', () => {
    const spell = refineCastSpell();
    expect(spell.executeOnNote).toBe(true);
  });

  it('returns a complete Spell object matching expected shape', () => {
    const spell = refineCastSpell();
    expect(spell).toEqual({
      name: 'Refine',
      path: spellPath('<refine>'),
      executeOnNote: true,
    });
  });
});
