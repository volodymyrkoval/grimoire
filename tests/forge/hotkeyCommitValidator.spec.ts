import { describe, it, expect } from 'vitest';
import type { Spell } from '../../src/domain/spells/Spell';
import { spellPath } from '../../src/domain/spells/SpellPath';
import { parseHotkey } from '../../src/domain/spells/Hotkey';
import { buildHotkeyDirectory } from '../../src/forge/HotkeyDirectory';
import { validateHotkeyCommit } from '../../src/forge/hotkeyCommitValidator';

describe('validateHotkeyCommit', () => {
  describe('pattern validation', () => {
    it('rejects empty string', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('', null, directory);
      expect(result).toEqual({ ok: false, reason: 'pattern' });
    });

    it('rejects uppercase letters', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('A', null, directory);
      expect(result).toEqual({ ok: false, reason: 'pattern' });
    });

    it('rejects digits', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('1', null, directory);
      expect(result).toEqual({ ok: false, reason: 'pattern' });
    });

    it('rejects letters with digits', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('ab1', null, directory);
      expect(result).toEqual({ ok: false, reason: 'pattern' });
    });

    it('rejects three letters', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('abc', null, directory);
      expect(result).toEqual({ ok: false, reason: 'pattern' });
    });

    it('rejects letters with symbols', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('a-', null, directory);
      expect(result).toEqual({ ok: false, reason: 'pattern' });
    });
  });

  describe('reserved letters', () => {
    it('rejects "f" as reserved for Forge', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('f', null, directory);
      expect(result).toEqual({ ok: false, reason: 'reserved-forge' });
    });

    it('rejects "r" as reserved for Refine', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('r', null, directory);
      expect(result).toEqual({ ok: false, reason: 'reserved-refine' });
    });
  });

  describe('collision detection', () => {
    it('returns collision when hotkey matches another spell in directory', () => {
      const p1 = spellPath('Spells/MySpell.md');
      const spells: readonly Spell[] = [
        {
          name: 'MySpell',
          path: p1,
          executeOnNote: false,
          hotkey: parseHotkey('g')!,
        },
      ];
      const directory = buildHotkeyDirectory(spells);
      const result = validateHotkeyCommit('g', null, directory);
      expect(result).toEqual({
        ok: false,
        reason: 'collision',
        collidingSpellName: 'MySpell',
      });
    });

    it('allows re-saving a spell\'s own existing hotkey in update mode', () => {
      const p1 = spellPath('Spells/MySpell.md');
      const spells: readonly Spell[] = [
        {
          name: 'MySpell',
          path: p1,
          executeOnNote: false,
          hotkey: parseHotkey('g')!,
        },
      ];
      const directory = buildHotkeyDirectory(spells);
      const result = validateHotkeyCommit('g', p1, directory);
      expect(result).toEqual({ ok: true, hotkey: 'g' });
    });

    it('detects collision even when selfPath is provided but differs', () => {
      const p1 = spellPath('Spells/Spell1.md');
      const p2 = spellPath('Spells/Spell2.md');
      const spells: readonly Spell[] = [
        {
          name: 'Spell1',
          path: p1,
          executeOnNote: false,
          hotkey: parseHotkey('g')!,
        },
      ];
      const directory = buildHotkeyDirectory(spells);
      const result = validateHotkeyCommit('g', p2, directory);
      expect(result).toEqual({
        ok: false,
        reason: 'collision',
        collidingSpellName: 'Spell1',
      });
    });
  });

  describe('valid commits', () => {
    it('accepts valid two-letter hotkey with empty directory', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('go', null, directory);
      expect(result).toEqual({ ok: true, hotkey: 'go' });
    });

    it('accepts valid single-letter hotkey with empty directory', () => {
      const directory = buildHotkeyDirectory([]);
      const result = validateHotkeyCommit('x', null, directory);
      expect(result).toEqual({ ok: true, hotkey: 'x' });
    });

    it('accepts valid hotkey when no collision exists', () => {
      const p1 = spellPath('Spells/MySpell.md');
      const spells: readonly Spell[] = [
        {
          name: 'MySpell',
          path: p1,
          executeOnNote: false,
          hotkey: parseHotkey('g')!,
        },
      ];
      const directory = buildHotkeyDirectory(spells);
      const result = validateHotkeyCommit('h', null, directory);
      expect(result).toEqual({ ok: true, hotkey: 'h' });
    });
  });
});
