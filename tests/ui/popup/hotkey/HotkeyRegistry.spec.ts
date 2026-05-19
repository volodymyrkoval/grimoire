import { describe, it, expect } from 'vitest';
import { HotkeyRegistry } from '../../../../src/ui/popup/hotkey/HotkeyRegistry';
import { parseHotkey } from '../../../../src/domain/spells/Hotkey';
import type { Spell, Sentinel } from '../../../../src/domain/spells/Spell';
import { spellPath } from '../../../../src/domain/spells/SpellPath';

const mockSpell = (name: string, hotkey: string | null): Spell => ({
  name,
  path: spellPath(`/mock/${name}`),
  executeOnNote: false,
  hotkey: hotkey ? parseHotkey(hotkey) : null,
});

const mockSentinel = (kind: 'forge' | 'refine' | 'separator'): Sentinel => ({
  kind,
  name: kind,
});

describe('HotkeyRegistry', () => {
  it('C1: instantiates with zero size', () => {
    const { registry } = HotkeyRegistry.build([], []);
    expect(registry.size()).toBe(0);
  });

  // C2 tests: build algorithm
  describe('C2: build algorithm', () => {

    it('registers sentinels (forge, refine) with correct size', () => {
      const sentinels: Sentinel[] = [mockSentinel('forge'), mockSentinel('separator'), mockSentinel('refine')];
      const { registry } = HotkeyRegistry.build([], sentinels);
      expect(registry.size()).toBe(2); // Only forge and refine, not separator
    });

    it('sentinel takes precedence over spell with same hotkey', () => {
      const spell = mockSpell('conflictSpell', 'f');
      const sentinels: Sentinel[] = [mockSentinel('forge')];
      const { registry, collisions } = HotkeyRegistry.build([spell], sentinels);
      expect(registry.size()).toBe(1); // Only the sentinel
      expect(collisions.dropped).toHaveLength(1);
      expect(collisions.dropped[0]).toEqual({
        hotkey: parseHotkey('f')!,
        ownerName: 'conflictSpell',
        reason: 'sentinel-takes-precedence',
      });
    });

    it('first spell wins when two spells have same hotkey', () => {
      const spell1 = mockSpell('first', 'g');
      const spell2 = mockSpell('second', 'g');
      const { registry, collisions } = HotkeyRegistry.build([spell1, spell2], []);
      expect(registry.size()).toBe(1);
      expect(collisions.dropped).toHaveLength(1);
      expect(collisions.dropped[0]).toEqual({
        hotkey: parseHotkey('g')!,
        ownerName: 'second',
        reason: 'first-spell-wins',
      });
    });

    it('prefix coexistence: sentinel "f" and spell "fo" both register (no drop)', () => {
      // The prefix-disjoint rule was removed — lookup() disambiguates exact
      // vs prefix at keypress time, so 'f' and 'fo' can coexist.
      const spell = mockSpell('spellFO', 'fo');
      const sentinels: Sentinel[] = [mockSentinel('forge')]; // 'f'
      const { registry, collisions } = HotkeyRegistry.build([spell], sentinels);
      expect(registry.size()).toBe(2);
      expect(collisions.dropped).toHaveLength(0);
    });

    it('prefix coexistence: spell "go" and spell "g" both register (no drop)', () => {
      const spellA = mockSpell('spellA', 'go');
      const spellB = mockSpell('spellB', 'g');
      const { registry, collisions } = HotkeyRegistry.build([spellA, spellB], []);
      expect(registry.size()).toBe(2);
      expect(collisions.dropped).toHaveLength(0);
    });

    it('correct rowIndex for sentinels: sentinelIndex offset by spells.length', () => {
      // Empty spells to focus on sentinel rowIndex calculation
      const sentinels: Sentinel[] = [
        mockSentinel('forge'), // rowIndex should be 0 + 0 = 0
        mockSentinel('separator'),
        mockSentinel('refine'), // rowIndex should be 0 + 2 = 2
      ];
      const { registry } = HotkeyRegistry.build([], sentinels);
      expect(registry.size()).toBe(2); // forge and refine registered, separator skipped
    });
  });

  // C3 tests: lookup
  describe('C3: lookup', () => {

    it('lookup("f") exact hits sentinel', () => {
      const sentinels: Sentinel[] = [mockSentinel('forge')];
      const { registry } = HotkeyRegistry.build([], sentinels);
      const hit = registry.lookup(parseHotkey('f')!);
      expect(hit.state).toBe('exact');
      if (hit.state === 'exact') {
        expect(hit.target.kind).toBe('sentinel');
      }
    });

    it('lookup("g") prefix when only "go" registered', () => {
      const spell = mockSpell('goSpell', 'go');
      const { registry } = HotkeyRegistry.build([spell], []);
      const hit = registry.lookup(parseHotkey('g')!);
      expect(hit.state).toBe('prefix');
    });

    it('lookup("xy") miss when nothing registered', () => {
      const { registry } = HotkeyRegistry.build([], []);
      const hit = registry.lookup(parseHotkey('xy')!);
      expect(hit.state).toBe('miss');
    });

    it('lookup("") miss on empty buffer', () => {
      const sentinels: Sentinel[] = [mockSentinel('forge')];
      const { registry } = HotkeyRegistry.build([], sentinels);
      const hit = registry.lookup('' as any); // Empty string, not a valid Hotkey but testing edge case
      expect(hit.state).toBe('miss');
    });
  });

  // C4 tests: comprehensive suite
  describe('C4: comprehensive tests', () => {

    it('C4.1: sentinels-only build', () => {
      const sentinels: Sentinel[] = [mockSentinel('forge'), mockSentinel('refine')];
      const { registry } = HotkeyRegistry.build([], sentinels);
      expect(registry.size()).toBe(2);

      const fHit = registry.lookup(parseHotkey('f')!);
      expect(fHit.state).toBe('exact');
      if (fHit.state === 'exact') {
        expect(fHit.target.kind).toBe('sentinel');
      }

      const rHit = registry.lookup(parseHotkey('r')!);
      expect(rHit.state).toBe('exact');
      if (rHit.state === 'exact') {
        expect(rHit.target.kind).toBe('sentinel');
      }
    });

    it('C4.2: sentinel takes precedence (dropped spell)', () => {
      const spell = mockSpell('conflictSpell', 'f');
      const sentinels: Sentinel[] = [mockSentinel('forge')];
      const { registry, collisions } = HotkeyRegistry.build([spell], sentinels);
      expect(registry.size()).toBe(1);
      expect(collisions.dropped).toHaveLength(1);
      expect(collisions.dropped[0].reason).toBe('sentinel-takes-precedence');
    });

    it('C4.3: first-spell-wins on duplicate spell hotkeys', () => {
      const spell1 = mockSpell('first', 'g');
      const spell2 = mockSpell('second', 'g');
      const { registry, collisions } = HotkeyRegistry.build([spell1, spell2], []);
      expect(registry.size()).toBe(1);
      expect(collisions.dropped).toHaveLength(1);
      expect(collisions.dropped[0]).toEqual({
        hotkey: parseHotkey('g')!,
        ownerName: 'second',
        reason: 'first-spell-wins',
      });
    });

    it('C4.4: prefix coexistence forward (sentinel "f" and spell "fo" both register)', () => {
      const spell = mockSpell('spellFO', 'fo');
      const sentinels: Sentinel[] = [mockSentinel('forge')]; // 'f'
      const { registry, collisions } = HotkeyRegistry.build([spell], sentinels);
      expect(registry.size()).toBe(2);
      expect(collisions.dropped).toHaveLength(0);

      // 'f' is still an exact sentinel hit (one-letter wins exact lookup).
      const fHit = registry.lookup(parseHotkey('f')!);
      expect(fHit.state).toBe('exact');
      // 'fo' is an exact spell hit (full two-letter match).
      const foHit = registry.lookup(parseHotkey('fo')!);
      expect(foHit.state).toBe('exact');
    });

    it('C4.5: prefix coexistence backward (spell "go" and spell "g" both register)', () => {
      const spellA = mockSpell('spellA', 'go');
      const spellB = mockSpell('spellB', 'g');
      const { registry, collisions } = HotkeyRegistry.build([spellA, spellB], []);
      expect(registry.size()).toBe(2);
      expect(collisions.dropped).toHaveLength(0);

      // 'g' is an exact hit for spellB (one-letter exact wins over prefix).
      const gHit = registry.lookup(parseHotkey('g')!);
      expect(gHit.state).toBe('exact');
      if (gHit.state === 'exact' && gHit.target.kind === 'spell') {
        expect(gHit.target.spell.name).toBe('spellB');
      }
      // 'go' is an exact hit for spellA.
      const goHit = registry.lookup(parseHotkey('go')!);
      expect(goHit.state).toBe('exact');
      if (goHit.state === 'exact' && goHit.target.kind === 'spell') {
        expect(goHit.target.spell.name).toBe('spellA');
      }
    });

    it('C4.6: lookup exact target returns correct target info', () => {
      const spell = mockSpell('mySpell', 'a');
      const { registry } = HotkeyRegistry.build([spell], []);
      const hit = registry.lookup(parseHotkey('a')!);
      expect(hit.state).toBe('exact');
      if (hit.state === 'exact') {
        expect(hit.target.kind).toBe('spell');
        if (hit.target.kind === 'spell') {
          expect(hit.target.spell.name).toBe('mySpell');
          expect(hit.target.rowIndex).toBe(0);
        }
      }
    });

    it('C4.7: lookup prefix when two-letter exists', () => {
      const spell = mockSpell('goSpell', 'go');
      const { registry } = HotkeyRegistry.build([spell], []);
      const hit = registry.lookup(parseHotkey('g')!);
      expect(hit.state).toBe('prefix');
    });

    it('C4.8: lookup miss for unregistered two-letter', () => {
      const spell = mockSpell('aSpell', 'a');
      const { registry } = HotkeyRegistry.build([spell], []);
      const hit = registry.lookup(parseHotkey('xy')!);
      expect(hit.state).toBe('miss');
    });

    it('C4.9: lookup miss on empty string', () => {
      const sentinels: Sentinel[] = [mockSentinel('forge')];
      const { registry } = HotkeyRegistry.build([], sentinels);
      const hit = registry.lookup('' as any);
      expect(hit.state).toBe('miss');
    });

    it('C4.coexist: two-letter spell coexists with one-letter sentinel sharing the prefix', () => {
      // After removing the prefix-disjoint rule, a spell with hotkey 'fd' must
      // coexist with the Forge sentinel ('f'). The user wants Shift+f to fire
      // Forge AND Shift+f-then-Shift+d to fire the 'fd' spell. The registry's
      // lookup() already supports this — it checks exact first, then prefix —
      // so the only behavior change is in build().
      const spell = mockSpell('fdSpell', 'fd');
      const sentinels: Sentinel[] = [mockSentinel('forge')]; // 'f'
      const { registry, collisions } = HotkeyRegistry.build([spell], sentinels);

      // Both must be registered — no drop.
      expect(registry.size()).toBe(2);
      expect(collisions.dropped).toHaveLength(0);

      // lookup('f') → exact sentinel (one-letter takes precedence on exact).
      const fHit = registry.lookup(parseHotkey('f')!);
      expect(fHit.state).toBe('exact');
      if (fHit.state === 'exact') {
        expect(fHit.target.kind).toBe('sentinel');
      }

      // lookup('fd') → exact spell.
      const fdHit = registry.lookup(parseHotkey('fd')!);
      expect(fdHit.state).toBe('exact');
      if (fdHit.state === 'exact' && fdHit.target.kind === 'spell') {
        expect(fdHit.target.spell.name).toBe('fdSpell');
      }
    });

    it('C4.10: rowIndex calculation for mixed spells and sentinels', () => {
      const spells: Spell[] = [
        mockSpell('s1', 'a'),
        mockSpell('s2', 'b'),
        mockSpell('s3', 'c'),
      ];
      const sentinels: Sentinel[] = [
        mockSentinel('forge'),    // index 0
        mockSentinel('separator'),
        mockSentinel('refine'),   // index 2
      ];
      const { registry } = HotkeyRegistry.build(spells, sentinels);
      expect(registry.size()).toBe(5); // 3 spells + 2 sentinels

      // Verify forge rowIndex is 3 + 0 = 3
      const forgeHit = registry.lookup(parseHotkey('f')!);
      expect(forgeHit.state).toBe('exact');
      if (forgeHit.state === 'exact' && forgeHit.target.kind === 'sentinel') {
        expect(forgeHit.target.rowIndex).toBe(3);
      }

      // Verify refine rowIndex is 3 + 2 = 5
      const refineHit = registry.lookup(parseHotkey('r')!);
      expect(refineHit.state).toBe('exact');
      if (refineHit.state === 'exact' && refineHit.target.kind === 'sentinel') {
        expect(refineHit.target.rowIndex).toBe(5);
      }
    });
  });
});
