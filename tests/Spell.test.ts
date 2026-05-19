import { describe, it, expect } from 'vitest';
import { EXECUTE_ON_NOTE_KEY, REFINE_SENTINEL_PATH, type Spell } from '../src/domain/spells/Spell';
import { parseHotkey } from '../src/domain/spells/Hotkey';
import { spellPath } from '../src/domain/spells/SpellPath';

describe('Spell', () => {
  it('exports EXECUTE_ON_NOTE_KEY constant with correct value', () => {
    expect(EXECUTE_ON_NOTE_KEY).toBe('grimoire-execute-on-note');
  });

  it('Spell interface includes executeOnNote field', () => {
    const spell: Spell = {
      name: 'test-spell',
      path: spellPath('test-spell.md'),
      executeOnNote: true,
      hotkey: null,
    };
    expect(spell.executeOnNote).toBe(true);
  });

  it('REFINE_SENTINEL_PATH has correct value', () => {
    expect(REFINE_SENTINEL_PATH).toBe('<grimoire-sentinel:refine>');
  });

  it('Spell interface includes hotkey field (optional)', () => {
    const spellWithHotkey: Spell = {
      name: 'test-spell',
      path: spellPath('test-spell.md'),
      executeOnNote: true,
      hotkey: parseHotkey('g'),
    };
    expect(spellWithHotkey.hotkey).toBe('g');

    const spellWithoutHotkey: Spell = {
      name: 'test-spell',
      path: spellPath('test-spell.md'),
      executeOnNote: true,
      hotkey: null,
    };
    expect(spellWithoutHotkey.hotkey).toBeNull();
  });

});
