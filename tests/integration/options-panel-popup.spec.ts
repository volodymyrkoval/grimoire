/**
 * Integration test: CommandPopup → ArrowRight → OptionsPanel popup-level seam.
 *
 * Seam: the boundary between CommandPopup (parent) and OptionsPanel (real child),
 * exercised via the harness. Covers the ArrowRight binding, phase transitions,
 * optionsCastAction callback, override-dot rendering, and idempotency guard.
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPopupHarness } from './harness';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import type { OptionsCastAction } from '../../src/ui/CommandPopup';

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
  it('open panel, click Cast → optionsCastAction called with spell and snapshot', () => {
    const optionsCastAction: OptionsCastAction = vi.fn();
    const h = createPopupHarness({ optionsCastAction });

    // Open options panel for first spell (index 0 = Banishment Hex)
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    // Submit the form (Cast)
    form.dispatchEvent(new Event('submit'));

    expect(optionsCastAction).toHaveBeenCalledOnce();

    const [spellArg, snapshotArg] = (optionsCastAction as ReturnType<typeof vi.fn>).mock.calls[0];

    // First arg: the spell object for Banishment Hex
    expect(spellArg).toMatchObject({
      name: 'Banishment Hex',
      path: '/spells/banishment.md',
    });

    // Second arg: the form snapshot with defaults
    expect(snapshotArg).toMatchObject({
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
    });
  });

  // ------------------------------------------------------------------ A4
  it('override flow: change model + set-as-default → dot lights on list; re-open → checkbox hidden', () => {
    const h = createPopupHarness();

    // Step 1: open options panel for spell at index 0 (Banishment Hex)
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    // Step 2: change model select to Opus
    const select = form.querySelector<HTMLSelectElement>('select')!;
    select.value = 'claude-opus-4-5';
    select.dispatchEvent(new Event('change'));

    // Step 3: tick "Set as default" checkbox
    // The checkbox label becomes visible because formState differs from snapshot
    const checkbox = form.querySelector<HTMLInputElement>('input[data-grimoire="set-as-default"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    // overrides.set('/spells/banishment.md', { model: 'claude-opus-4-5', effort: 'medium' })
    // onOverrideChanged fires → spellsPanel.refreshOverrides() → dot should be queued

    // Step 4: exit detail phase (simulating Escape via modal.close())
    h.modal.close();

    // Back in search phase
    expect(h.isInDetail()).toBe(false);

    // Step 5: at least one spell row has the override dot (Banishment Hex at index 0)
    const spellRows = h.visibleSpellRows();
    const dotsInRows = spellRows.map((row) => !!row.querySelector('.grimoire-override-dot'));
    expect(dotsInRows[0]).toBe(true);
    // Other rows should not have a dot
    expect(dotsInRows.slice(1).some(Boolean)).toBe(false);

    // Step 6: re-open panel for the same spell (index 0)
    h.pressKey('ArrowRight');

    const form2 = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form2).not.toBeNull();

    // Step 7: checkbox label must be hidden because resolved snapshot matches formState
    // (override → opus/medium; formState starts at opus/medium; snapshotEqualsCurrent = true)
    const checkboxLabel = form2.querySelector<HTMLElement>('label:has(input[type="checkbox"])')!;
    expect(checkboxLabel).not.toBeNull();
    expect(checkboxLabel.style.display).toBe('none');
  });

  // ------------------------------------------------------------------ A5
  it('pre-loaded override → dot visible on popup open for overridden spell only', () => {
    const overrides = new SpellOverrideStore({
      data: {
        settings: {} as any,
        spellOverrides: {
          '/spells/banishment.md': { model: 'claude-sonnet-4-5', effort: 'medium' },
        },
      },
      saver: { schedule: vi.fn() } as any,
    });

    const h = createPopupHarness({ overrides });

    const rows = h.visibleSpellRows();

    // Index 0 = Banishment Hex → has override dot
    expect(rows[0].querySelector('.grimoire-override-dot')).not.toBeNull();

    // Index 1 = Divination Ritual → no override dot
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
});
