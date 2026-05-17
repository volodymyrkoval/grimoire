/**
 * Integration test: SpellList + real SentinelRow — sentinel description lines.
 *
 * Seam: SpellList (parent) + real SentinelRow child. No child components mocked.
 *
 * Scenarios:
 *   (a) Forge sentinel row contains .sentinel-description with text
 *       "Author a new spell from a description".
 *   (b) Refine sentinel row contains .sentinel-description with text
 *       "Rewrite the active note".
 *   (c) A user-authored spell row rendered via SpellList does NOT contain
 *       .sentinel-description.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SpellList } from '../../src/ui/components/SpellList';
import { TypedEmitter } from '../../src/infra/TypedEmitter';
import type { SpellEvents } from '../../src/domain/spells/SpellEvents';
import type { Spell, Sentinel } from '../../src/domain/spells/Spell';
import { spellPath } from '../../src/domain/spells/SpellPath';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LIGHTNING_BOLT: Spell = {
  name: 'Lightning Bolt',
  path: spellPath('/spells/lightning-bolt.md'),
  executeOnNote: false,
};

const FORGE_SENTINEL: Sentinel = {
  kind: 'forge',
  name: 'Forge',
};

const REFINE_SENTINEL: Sentinel = {
  kind: 'refine',
  name: 'Refine',
};

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

interface Harness {
  container: HTMLElement;
  list: SpellList;
}

function mountSpellList(sentinels: Sentinel[]): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const emitter = new TypedEmitter<SpellEvents>();
  const list = new SpellList(container, emitter, sentinels);
  list.render([LIGHTNING_BOLT], 0);

  return { container, list };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpellList + SentinelRow sentinel descriptions', () => {
  let h: Harness;

  afterEach(() => {
    h.container.remove();
  });

  // (a) ------------------------------------------------------------------
  describe('(a) Forge sentinel row description', () => {
    beforeEach(() => {
      h = mountSpellList([FORGE_SENTINEL]);
    });

    it('renders .sentinel-description inside the forge sentinel row', () => {
      const forgeRow = h.container.querySelector('.sentinel-row') as HTMLElement | null;
      expect(forgeRow).not.toBeNull();

      const description = forgeRow!.querySelector('.sentinel-description') as HTMLElement | null;
      expect(description).not.toBeNull();
    });

    it('the forge .sentinel-description has text "Author a new spell from a description"', () => {
      const forgeRow = h.container.querySelector('.sentinel-row') as HTMLElement | null;
      const description = forgeRow!.querySelector('.sentinel-description') as HTMLElement | null;

      expect(description!.textContent).toBe('Author a new spell from a description');
    });
  });

  // (b) ------------------------------------------------------------------
  describe('(b) Refine sentinel row description', () => {
    beforeEach(() => {
      h = mountSpellList([REFINE_SENTINEL]);
    });

    it('renders .sentinel-description inside the refine sentinel row', () => {
      const refineRow = h.container.querySelector('.sentinel-row') as HTMLElement | null;
      expect(refineRow).not.toBeNull();

      const description = refineRow!.querySelector('.sentinel-description') as HTMLElement | null;
      expect(description).not.toBeNull();
    });

    it('the refine .sentinel-description has text "Rewrite the active note"', () => {
      const refineRow = h.container.querySelector('.sentinel-row') as HTMLElement | null;
      const description = refineRow!.querySelector('.sentinel-description') as HTMLElement | null;

      expect(description!.textContent).toBe('Rewrite the active note');
    });
  });

  // (c) ------------------------------------------------------------------
  describe('(c) User-authored spell row has no description', () => {
    beforeEach(() => {
      h = mountSpellList([FORGE_SENTINEL, REFINE_SENTINEL]);
    });

    it('the .spells-row for a user-authored spell does NOT contain .sentinel-description', () => {
      const spellRow = h.container.querySelector('.spells-row') as HTMLElement | null;
      expect(spellRow).not.toBeNull();

      const description = spellRow!.querySelector('.sentinel-description');
      expect(description).toBeNull();
    });
  });
});
