import type { Hotkey } from '../../../domain/spells/Hotkey';
import { SENTINEL_HOTKEYS } from '../../../domain/spells/Hotkey';
import type { Spell } from '../../../domain/spells/Spell';
import type { Sentinel } from '../../../domain/spells/Spell';

export type RegistryTarget =
  | { kind: 'spell'; spell: Spell; rowIndex: number }
  | { kind: 'sentinel'; sentinel: Sentinel; rowIndex: number };

export type RegistryHit =
  | { state: 'exact'; target: RegistryTarget }
  | { state: 'prefix' }
  | { state: 'miss' };

export interface CollisionReport {
  readonly dropped: ReadonlyArray<{
    hotkey: Hotkey;
    ownerName: string;
    reason: 'sentinel-takes-precedence' | 'first-spell-wins';
  }>;
}

export class HotkeyRegistry {
  readonly #map = new Map<string, RegistryTarget>();

  static build(
    spells: readonly Spell[],
    sentinels: readonly Sentinel[]
  ): { registry: HotkeyRegistry; collisions: CollisionReport } {
    const registry = new HotkeyRegistry();
    const dropped: Array<{
      hotkey: Hotkey;
      ownerName: string;
      reason: 'sentinel-takes-precedence' | 'first-spell-wins';
    }> = [];

    HotkeyRegistry.#registerSentinels(registry, spells, sentinels);
    HotkeyRegistry.#registerSpells(registry, spells, dropped);

    return { registry, collisions: { dropped } };
  }

  static #registerSentinels(
    registry: HotkeyRegistry,
    spells: readonly Spell[],
    sentinels: readonly Sentinel[]
  ): void {
    sentinels.forEach((sentinel, sentinelIndex) => {
      if (sentinel.kind === 'separator') return;
      const hotkey = SENTINEL_HOTKEYS[sentinel.kind];
      const rowIndex = spells.length + sentinelIndex;
      registry.#map.set(hotkey, { kind: 'sentinel', sentinel, rowIndex });
    });
  }

  static #registerSpells(
    registry: HotkeyRegistry,
    spells: readonly Spell[],
    dropped: Array<{ hotkey: Hotkey; ownerName: string; reason: 'sentinel-takes-precedence' | 'first-spell-wins' }>
  ): void {
    spells.forEach((spell, spellIndex) => {
      if (spell.hotkey === null) return;
      const hotkey = spell.hotkey;

      if (registry.#map.has(hotkey)) {
        // Check for exact-string collision. Prefix overlap is allowed: lookup()
        // already disambiguates one-letter exact matches from two-letter
        // extensions (exact wins; a follow-up keypress promotes the buffer to a
        // two-letter exact hit). This lets the user press Shift+f to fire Forge
        // and Shift+f-then-Shift+d to fire a separately registered 'fd' spell.
        const existing = registry.#map.get(hotkey)!;
        dropped.push({
          hotkey,
          ownerName: spell.name,
          reason: existing.kind === 'sentinel' ? 'sentinel-takes-precedence' : 'first-spell-wins',
        });
      } else {
        registry.#map.set(hotkey, { kind: 'spell', spell, rowIndex: spellIndex });
      }
    });
  }

  size(): number {
    return this.#map.size;
  }

  lookup(buffer: string): RegistryHit {
    if (buffer.length === 0) {
      return { state: 'miss' };
    }

    if (this.#map.has(buffer)) {
      return { state: 'exact', target: this.#map.get(buffer)! };
    }

    // Check for prefix match (if buffer is 1-letter, see if any 2-letter key starts with it)
    if (buffer.length === 1) {
      for (const key of this.#map.keys()) {
        if (key.length === 2 && key.startsWith(buffer)) {
          return { state: 'prefix' };
        }
      }
    }

    return { state: 'miss' };
  }
}
