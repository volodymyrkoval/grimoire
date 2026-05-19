import { describe, it, expect } from 'vitest';
import type { Spell } from '../../src/domain/spells/Spell';
import { spellPath } from '../../src/domain/spells/SpellPath';
import { parseHotkey } from '../../src/domain/spells/Hotkey';
import { buildHotkeyDirectory } from '../../src/forge/HotkeyDirectory';

describe('HotkeyDirectory', () => {
  it('returns an empty map when given an empty spell list', () => {
    const directory = buildHotkeyDirectory([]);
    expect(directory.inUse().size).toBe(0);
  });

  it('excludes spells with hotkey: null', () => {
    const spells: readonly Spell[] = [
      {
        name: 'Spell A',
        path: spellPath('Spells/A.md'),
        executeOnNote: false,
        hotkey: null,
      },
      {
        name: 'Spell B',
        path: spellPath('Spells/B.md'),
        executeOnNote: false,
        hotkey: null,
      },
    ];
    const directory = buildHotkeyDirectory(spells);
    expect(directory.inUse().size).toBe(0);
  });

  it('includes spells with non-null hotkeys in the map', () => {
    const spells: readonly Spell[] = [
      {
        name: 'Spell A',
        path: spellPath('Spells/A.md'),
        executeOnNote: false,
        hotkey: parseHotkey('a')!,
      },
      {
        name: 'Spell B',
        path: spellPath('Spells/B.md'),
        executeOnNote: false,
        hotkey: parseHotkey('b')!,
      },
    ];
    const directory = buildHotkeyDirectory(spells);
    const inUse = directory.inUse();
    expect(inUse.size).toBe(2);
    expect(inUse.get(spellPath('Spells/A.md'))).toBe('a');
    expect(inUse.get(spellPath('Spells/B.md'))).toBe('b');
  });

  it('maps spells with hotkeys by path correctly', () => {
    const spells: readonly Spell[] = [
      {
        name: 'Spell A',
        path: spellPath('Spells/A.md'),
        executeOnNote: false,
        hotkey: parseHotkey('x')!,
      },
      {
        name: 'Spell B',
        path: spellPath('Spells/B.md'),
        executeOnNote: false,
        hotkey: null,
      },
      {
        name: 'Spell C',
        path: spellPath('Spells/C.md'),
        executeOnNote: true,
        hotkey: parseHotkey('y')!,
      },
    ];
    const directory = buildHotkeyDirectory(spells);
    const inUse = directory.inUse();
    expect(inUse.size).toBe(2);
    expect(inUse.get(spellPath('Spells/A.md'))).toBe('x');
    expect(inUse.get(spellPath('Spells/C.md'))).toBe('y');
    expect(inUse.get(spellPath('Spells/B.md'))).toBeUndefined();
  });

  it('returns the same map instance across multiple calls', () => {
    const spells: readonly Spell[] = [
      {
        name: 'Spell A',
        path: spellPath('Spells/A.md'),
        executeOnNote: false,
        hotkey: parseHotkey('a')!,
      },
    ];
    const directory = buildHotkeyDirectory(spells);
    const firstCall = directory.inUse();
    const secondCall = directory.inUse();
    expect(firstCall).toBe(secondCall);
  });

  describe('nameOf', () => {
    it('returns the spell name for a given path', () => {
      const pathA = spellPath('Spells/A.md');
      const pathB = spellPath('Spells/B.md');
      const spells: readonly Spell[] = [
        {
          name: 'Spell A',
          path: pathA,
          executeOnNote: false,
          hotkey: parseHotkey('a')!,
        },
        {
          name: 'Spell B',
          path: pathB,
          executeOnNote: false,
          hotkey: null,
        },
      ];
      const directory = buildHotkeyDirectory(spells);
      expect(directory.nameOf(pathA)).toBe('Spell A');
      expect(directory.nameOf(pathB)).toBe('Spell B');
    });

    it('resolves spell names for all spells, including those without hotkeys', () => {
      const pathWithHotkey = spellPath('Spells/WithHotkey.md');
      const pathNoHotkey = spellPath('Spells/NoHotkey.md');
      const spells: readonly Spell[] = [
        {
          name: 'With Hotkey',
          path: pathWithHotkey,
          executeOnNote: false,
          hotkey: parseHotkey('w')!,
        },
        {
          name: 'No Hotkey',
          path: pathNoHotkey,
          executeOnNote: true,
          hotkey: null,
        },
      ];
      const directory = buildHotkeyDirectory(spells);
      expect(directory.nameOf(pathWithHotkey)).toBe('With Hotkey');
      expect(directory.nameOf(pathNoHotkey)).toBe('No Hotkey');
    });

    it('returns undefined for a path not in the spell list', () => {
      const directory = buildHotkeyDirectory([]);
      expect(directory.nameOf(spellPath('unknown/path.md'))).toBeUndefined();
    });
  });
});
