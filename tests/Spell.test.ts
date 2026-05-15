import { describe, it, expect } from 'vitest';
import { EXECUTE_ON_NOTE_KEY, REFINE_SENTINEL_PATH, type Spell } from '../src/domain/spells/Spell';

describe('Spell', () => {
  it('exports EXECUTE_ON_NOTE_KEY constant with correct value', () => {
    expect(EXECUTE_ON_NOTE_KEY).toBe('grimoire-execute-on-note');
  });

  it('Spell interface includes executeOnNote field', () => {
    const spell: Spell = {
      name: 'test-spell',
      path: { segments: [] },
      executeOnNote: true,
    };
    expect(spell.executeOnNote).toBe(true);
  });

  it('REFINE_SENTINEL_PATH has correct value', () => {
    expect(REFINE_SENTINEL_PATH).toBe('<grimoire-sentinel:refine>');
  });

});
