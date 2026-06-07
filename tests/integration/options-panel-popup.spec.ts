/**
 * Integration test: CommandPopup → ArrowRight → OptionsPanel popup-level seam.
 *
 * Seam: the boundary between CommandPopup (parent) and OptionsPanel (real child),
 * exercised via the harness. Covers the ArrowRight binding, phase transitions,
 * castAction callback, override-dot rendering, and idempotency guard.
 *
 * Spell rows are alphabetically sorted by `getSpells`. Harness spells in sorted order:
 *   index 0 → Banishment Hex       (/spells/banishment.md)
 *   index 1 → Divination Ritual    (/spells/divination.md)
 *   index 2 → Enchantment Charm    (/spells/enchantment.md)
 *   index 3 → Healing Incantation  (/spells/healing.md)
 *   index 4 → Protection Rune      (/spells/protection.md)
 *   index 5 → Restoration Spell    (/spells/restoration.md)
 *   index 6 → Scrying Mirror       (/spells/scrying.md)
 *   index 7 → Summoning Circle     (/spells/summoning.md)
 *   index 8 → Transmutation        (/spells/transmutation.md)
 *   index 9 → Warding Barrier      (/spells/warding.md)
 *   index 10 → Forge  (sentinel)
 *   index 11 → Refine (sentinel)
 */

import { describe, it, expect, vi } from 'vitest';
import { modelId } from '../../src/domain/settings/ModelId';
import { createPopupHarness } from './harness';
import type { CastAction } from '../../src/ui/CommandPopup';
import type { CastingFrontmatterReader } from '../../src/infra/castingFrontmatter';
import type { SpellCastingSettings } from '../../src/domain/settings/CastingSettings';

describe('options-panel-popup integration — ArrowRight → OptionsPanel seam', () => {
  // ------------------------------------------------------------------ A1
  it('ArrowRight on first spell row (index 0) opens the options panel and hides the search input', () => {
    const h = createPopupHarness();

    // On open, selectedIndex = 0 (Banishment Hex), phase = search
    h.pressKey('ArrowRight');

    // Options panel form is mounted
    expect(h.contentEl.querySelector('form.options-panel')).not.toBeNull();

    // Search-phase input (placeholder "Search spells…") is gone
    // Note: isInDetail() cannot be used here because OptionsPanel itself contains
    // an input[type="text"] (the ContextNotesInput search field).
    expect(h.contentEl.querySelector('input[placeholder*="Search"]')).toBeNull();
  });

  // ------------------------------------------------------------------ A2
  it('ArrowRight on a sentinel row (index 10) is a no-op — search input stays visible', () => {
    const h = createPopupHarness();

    // Navigate from index 0 down to index 10 (first sentinel = Forge)
    for (let i = 0; i < 10; i++) {
      h.pressKey('ArrowDown');
    }

    h.pressKey('ArrowRight');

    // Search-phase input (placeholder "Search spells…") is still present
    expect(h.contentEl.querySelector('input[placeholder*="Search"]')).not.toBeNull();

    // No options panel was mounted
    expect(h.contentEl.querySelector('form.options-panel')).toBeNull();
  });

  // ------------------------------------------------------------------ A3
  it('open panel, click Cast → castAction called with spell and snapshot', () => {
    const castAction: CastAction = vi.fn();
    const h = createPopupHarness({ castAction });

    // Open options panel for first spell (index 0 = Banishment Hex)
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    // Submit the form (Cast)
    form.dispatchEvent(new Event('submit'));

    expect(castAction).toHaveBeenCalledOnce();

    const [spellArg, snapshotArg] = (castAction as ReturnType<typeof vi.fn>).mock.calls[0];

    // First arg: the spell object for Banishment Hex
    expect(spellArg).toMatchObject({
      name: 'Banishment Hex',
      path: '/spells/banishment.md',
    });

    // Second arg: the form snapshot with defaults
    expect(snapshotArg).toMatchObject({
      model: modelId('sonnet'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
    });
  });

  // ------------------------------------------------------------------ A4
  it('reader-based dot: dot lights on list when reader returns a casting block for a spell', () => {
    // reader returns a block for banishment only (index 0), null for everything else
    const blockForBanishment: SpellCastingSettings = {
      provider: 'claude-code',
      model: modelId('opus'),
      effort: 'medium',
    };
    const reader: CastingFrontmatterReader = vi.fn().mockImplementation((path: string) =>
      path === '/spells/banishment.md' ? blockForBanishment : null,
    );

    const h = createPopupHarness({ reader });

    // At least one spell row has the override dot (Banishment Hex at index 0)
    const spellRows = h.visibleSpellRows();
    const dotsInRows = spellRows.map((row) => !!row.querySelector('.grimoire-override-dot'));
    expect(dotsInRows[0]).toBe(true);
    // Other rows should not have a dot
    expect(dotsInRows.slice(1).some(Boolean)).toBe(false);

    h.modal.close();
  });

  // ------------------------------------------------------------------ A5
  it('pre-loaded casting block → dot visible on popup open for overridden spell only', () => {
    // reader returns a block only for banishment, simulating a pre-written frontmatter block
    const reader: CastingFrontmatterReader = vi.fn().mockImplementation((path: string) =>
      path === '/spells/banishment.md'
        ? { provider: 'claude-code', model: modelId('sonnet'), effort: 'medium' as const }
        : null,
    );

    const h = createPopupHarness({ reader });

    const rows = h.visibleSpellRows();

    // Index 0 = Banishment Hex → has casting block → dot present
    expect(rows[0].querySelector('.grimoire-override-dot')).not.toBeNull();

    // Index 1 = Divination Ritual → no casting block → no dot
    expect(rows[1].querySelector('.grimoire-override-dot')).toBeNull();
  });

  // ------------------------------------------------------------------ A6
  it('ArrowRight while already in detail phase → no-op (panel not re-created)', () => {
    const h = createPopupHarness();

    // First ArrowRight → opens panel
    h.pressKey('ArrowRight');

    const panelsBefore = h.contentEl.querySelectorAll('form.options-panel');
    expect(panelsBefore.length).toBe(1);

    // Second ArrowRight while in detail phase → should be a no-op
    h.pressKey('ArrowRight');

    const panelsAfter = h.contentEl.querySelectorAll('form.options-panel');
    expect(panelsAfter.length).toBe(1);

    // The panel element should be the same (not replaced)
    expect(panelsAfter[0]).toBe(panelsBefore[0]);
  });

  // ------------------------------------------------------------------ A7
  it('follow-up is cleared after casting — reopening options panel shows empty follow-up', () => {
    const h = createPopupHarness();

    // Open options panel for Banishment Hex (index 0)
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    const followUpTextarea = form.querySelector('textarea') as HTMLTextAreaElement;

    // Type a follow-up
    followUpTextarea.value = 'Ask again';
    followUpTextarea.dispatchEvent(new Event('input'));

    // Cast
    form.dispatchEvent(new Event('submit'));

    // Go back to search phase, then reopen options panel for the same spell
    h.clickBack();
    h.pressKey('ArrowRight');

    const form2 = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    const followUpTextarea2 = form2.querySelector('textarea') as HTMLTextAreaElement;

    expect(followUpTextarea2.value).toBe('');
  });
});
