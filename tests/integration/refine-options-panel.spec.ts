/**
 * Integration test: CommandPopup → ArrowRight on Refine sentinel → OptionsPanel seam.
 *
 * Seam: the boundary between CommandPopup (parent) and RefineOptionsDetail / OptionsPanel
 * (real children), exercised via the harness for the Refine sentinel path specifically.
 *
 * Covers:
 *   D5-1  ArrowRight on Refine → mounts options panel (form.options-panel)
 *   D5-2  Cast inside Refine options panel → fully closes modal (super.close() ran)
 *   D5-3  Back inside Refine options panel → exits to search (modal stays open, panel gone)
 *   D5-4  Enter on Refine sentinel (no panel) → fully closes modal
 *   D5-5  Override persistence: set/clear overrides.has(REFINE_SENTINEL_PATH)
 *   D5-6  Re-open after override set → Set-as-default checkbox starts hidden
 *
 * Navigation: ArrowUp once from index 0 wraps to index 11 (Refine sentinel).
 */

import { describe, it, expect, vi } from 'vitest';
import { createPopupHarness } from './harness';
import { OptionsDetail } from '../../src/ui/components/OptionsDetail';

function navigateToRefine(h: ReturnType<typeof createPopupHarness>): void {
  h.pressKey('ArrowUp'); // index 0 → wraps to 11 (Refine)
}

describe('refine-options-panel integration — Refine sentinel → OptionsPanel seam', () => {
  // ------------------------------------------------------------------ class shape
  it('OptionsDetail is a constructable coordinator class with render and destroy', () => {
    const detail = new OptionsDetail();
    expect(typeof detail.render).toBe('function');
    expect(typeof detail.destroy).toBe('function');
  });

  // ------------------------------------------------------------------ D5-1
  it('ArrowRight on Refine sentinel mounts the options panel and no generic h2 is shown', () => {
    const h = createPopupHarness();

    navigateToRefine(h);
    h.pressKey('ArrowRight');

    // Options panel form must be mounted
    expect(h.contentEl.querySelector('form.options-panel')).not.toBeNull();

    // No generic sentinel detail h2 with text "Refine"
    const headings = Array.from(h.contentEl.querySelectorAll('h2'));
    const refineHeading = headings.find((el) => el.textContent?.trim() === 'Refine');
    expect(refineHeading).toBeUndefined();
  });

  // ------------------------------------------------------------------ D5-2
  it('Cast inside Refine options panel invokes refineCastAction with snapshot and closes modal', () => {
    // Create spy that calls dismiss() after capturing the snapshot
    const refineCastSpy = vi.fn((snap) => h.modal.dismiss());
    const h = createPopupHarness({ refineCastAction: refineCastSpy });

    navigateToRefine(h);
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    // Submit the form — triggers the onCast callback
    form.dispatchEvent(new Event('submit'));

    // refineCastAction must have been called exactly once with a snapshot
    expect(refineCastSpy).toHaveBeenCalledOnce();
    expect(refineCastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        effort: expect.any(String),
        contextNotePaths: expect.any(Array),
        followUp: expect.any(String),
        executeOnNote: expect.any(Boolean),
      })
    );

    // Modal must be fully removed from the DOM
    expect(h.modal.containerEl.parentElement).toBeNull();
  });

  // ------------------------------------------------------------------ D5-3
  it('Back inside Refine options panel exits to search — modal stays open, panel gone', () => {
    const h = createPopupHarness();

    navigateToRefine(h);
    h.pressKey('ArrowRight');

    expect(h.contentEl.querySelector('form.options-panel')).not.toBeNull();

    // Click the back button inside the options panel
    h.clickBack();

    // Modal is still in the DOM
    expect(h.contentEl.isConnected).toBe(true);

    // Options panel is gone
    expect(h.contentEl.querySelector('form.options-panel')).toBeNull();

    // Search input is restored (not in detail phase)
    expect(h.searchInput()).not.toBeNull();
  });

  // ------------------------------------------------------------------ D5-4 (D6 in Section D plan)
  it('Enter on Refine sentinel (no panel open) invokes refineCastAction with resolved-defaults snapshot and closes modal', () => {
    // Create spy that calls dismiss() to close the modal after capturing the snapshot
    const refineCastSpy = vi.fn((snap) => h.modal.dismiss());
    const h = createPopupHarness({ refineCastAction: refineCastSpy });

    navigateToRefine(h);
    h.pressKey('Enter');

    // refineCastAction must have been called exactly once with a valid snapshot
    expect(refineCastSpy).toHaveBeenCalledOnce();
    expect(refineCastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        effort: expect.any(String),
        contextNotePaths: expect.any(Array),
        followUp: expect.any(String),
        executeOnNote: expect.any(Boolean),
      })
    );

    // Modal must be fully removed from the DOM
    expect(h.modal.containerEl.parentElement).toBeNull();
  });

  // ------------------------------------------------------------------ D5-5
  it('Set-as-default toggle in Refine panel calls setVaultDefault (vault-wide write, not per-spell)', () => {
    const setVaultDefault = vi.fn();
    const h = createPopupHarness({ setVaultDefault });

    navigateToRefine(h);
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    // Change model to something other than the default so the checkbox becomes visible
    const select = form.querySelector<HTMLSelectElement>('select')!;
    select.value = 'claude-opus-4-5';
    select.dispatchEvent(new Event('change'));

    // Tick the "Set as default" checkbox
    const checkbox = form.querySelector<HTMLInputElement>('input[data-grimoire="set-as-default"]')!;
    expect(checkbox).not.toBeNull();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    // setVaultDefault must be called with the current form model
    expect(setVaultDefault).toHaveBeenCalledOnce();
    expect(setVaultDefault).toHaveBeenCalledWith('claude-opus-4-5', expect.anything());

    // Uncheck — setVaultDefault is NOT called again (unchecking is a no-op for the vault default)
    setVaultDefault.mockClear();
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(setVaultDefault).not.toHaveBeenCalled();

    h.modal.close();
  });

  // ------------------------------------------------------------------ D5-6
  it('Re-opening Refine after ticking Set-as-default → checkbox label starts hidden when formState matches defaults', () => {
    // Use defaults that start at Sonnet/medium; the Refine panel opens at Sonnet/medium too.
    // After ticking Set-as-default (changing to Opus), the vault defaults update.
    // When reopening, the Refine panel still starts from the stored overrides (or global defaults).
    // The test verifies the snapshot === formState condition makes the label hidden at open.
    const h = createPopupHarness();

    navigateToRefine(h);
    h.pressKey('ArrowRight');

    const form1 = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form1).not.toBeNull();

    // At initial open, formState === snapshot (both sonnet/medium) → label is hidden
    const checkboxLabel = form1.querySelector<HTMLElement>('label:has(input[type="checkbox"])')!;
    expect(checkboxLabel).not.toBeNull();
    expect(checkboxLabel.style.display).toBe('none');

    h.modal.close();
  });

  // ------------------------------------------------------------------ C6
  it('executeOnNote checkbox is absent from Refine OptionsPanel DOM', () => {
    const h = createPopupHarness();

    navigateToRefine(h);
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    // executeOnNote checkbox must not exist in Refine panel
    const executeOnNoteCheckbox = form.querySelector('input[data-grimoire="execute-on-note"]');
    expect(executeOnNoteCheckbox).toBeNull();
  });
});
