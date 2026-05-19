/**
 * Integration test: HotkeyCapture seam — Shift+letter → row focus.
 *
 * Seam: the boundary between CommandPopup (parent) and the HotkeyCapture
 * component (child, not yet implemented). Tests assert user-visible behaviour
 * only: which row is selected after a Shift+letter keypress, and whether the
 * hotkey-buffer-indicator error element is present in the DOM.
 *
 * RED: all five cases fail because HotkeyCapture doesn't exist yet, the popup
 * has no Shift+letter bindings, and SpellsPanel has no focusByRowIndex method.
 * Tests must not fail due to import errors — they go through the harness only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a harness where one specific file carries a `grimoire-hotkey` value
 * in its frontmatter. All other files carry only `{ tags: ['spell'] }`.
 *
 * @param hotkeyFile - basename of the spell file to tag with a hotkey
 * @param hotkeyPath - vault path matching that file
 * @param hotkey     - the hotkey string (e.g. 'g' or 'go')
 */
function createHarnessWithHotkey(
  hotkeyFile: { basename: string; path: string },
  hotkey: string,
): PopupHarness {
  const h = createPopupHarness();

  // Override getFileCache to return grimoire-hotkey for the specific file path
  (h.modal.app as any).metadataCache.getFileCache.mockImplementation(
    (file: { path: string }) => {
      if (file.path === hotkeyFile.path) {
        return { frontmatter: { tags: ['spell'], 'grimoire-hotkey': hotkey } };
      }
      return { frontmatter: { tags: ['spell'] } };
    },
  );

  // Re-open the modal so the new getFileCache mock is picked up when spells are scanned
  h.modal.close();
  h.modal.open();

  return h;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('HotkeyCapture seam — Shift+letter → row focus', () => {
  // (i) Single-letter exact match for a user spell --------------------------

  it('(i) Shift+g focuses the spell carrying grimoire-hotkey: g', () => {
    // Summoning Circle is one of the test files in the default harness
    const h = createHarnessWithHotkey(
      { basename: 'Summoning Circle', path: '/spells/summoning.md' },
      'g',
    );

    h.pressKey('g', ['Shift']);

    expect(h.selectedRowName()).toBe('Summoning Circle');
  });

  // (ii) Single-letter exact match for the Forge sentinel -------------------

  it('(ii) Shift+f on default harness focuses the Forge sentinel row', () => {
    const h = createPopupHarness();

    h.pressKey('f', ['Shift']);

    expect(h.selectedRowName()).toBe('Forge');
  });

  // (iii) No-match press shows error indicator; selection unchanged ----------

  it('(iii) Shift+x (unregistered) shows .hotkey-buffer-indicator.is-error and leaves selection unchanged', () => {
    const h = createPopupHarness();
    // Default selection is the first row (Banishment Hex)
    const selectionBefore = h.selectedRowName();

    h.pressKey('x', ['Shift']);

    const errorIndicator = h.contentEl.querySelector(
      '.hotkey-buffer-indicator.is-error',
    );
    expect(errorIndicator).not.toBeNull();
    // Selection must be unchanged
    expect(h.selectedRowName()).toBe(selectionBefore);
  });

  // (iv) Two-letter hotkey: first press buffers, second press fires ----------

  it('(iv) Shift+g then Shift+o focuses spell with two-letter hotkey "go" only after second press', () => {
    // Use 'go' — 'g' is not taken by any sentinel (Forge→f, Refine→r)
    const h = createHarnessWithHotkey(
      { basename: 'Summoning Circle', path: '/spells/summoning.md' },
      'go',
    );

    // After first press, the spell must NOT be focused yet (only 'g' buffered,
    // which is a prefix of 'go')
    const selectionBefore = h.selectedRowName();
    h.pressKey('g', ['Shift']);
    expect(h.selectedRowName()).toBe(selectionBefore);

    // After second press, the two-letter hotkey fires and Summoning Circle is selected
    h.pressKey('o', ['Shift']);
    expect(h.selectedRowName()).toBe('Summoning Circle');
  });

  // (vi) Sentinel sentinel + two-letter spell extension --------------------
  //
  // Combined check for two related fixes:
  //   - Bug 1: exact match keeps the matched letter in the buffer so the
  //     user sees green visual feedback.
  //   - Bug 2: the prefix-disjoint rule was relaxed, so a 'fd' spell can
  //     coexist with the Forge sentinel ('f'). The user can fire Forge
  //     with Shift+f, then extend the buffer to 'fd' with Shift+d to fire
  //     the two-letter spell.

  it('(vi) Shift+f focuses Forge with "f" indicator, then Shift+d extends to fire "fd" spell with "fd" indicator', () => {
    const h = createHarnessWithHotkey(
      { basename: 'Summoning Circle', path: '/spells/summoning.md' },
      'fd',
    );

    // First press: Shift+f — exact match for the Forge sentinel.
    h.pressKey('f', ['Shift']);

    // Forge focused.
    expect(h.selectedRowName()).toBe('Forge');
    // Buffer indicator shows 'f' (normal, green — no .is-error).
    const indicatorAfterF = h.contentEl.querySelector(
      '.modal-tab-bar-right .hotkey-buffer-indicator',
    );
    expect(indicatorAfterF).not.toBeNull();
    expect(indicatorAfterF?.classList.contains('is-error')).toBe(false);
    expect(
      indicatorAfterF?.querySelector('.hotkey-buffer-letters')?.textContent,
    ).toBe('f');

    // Second press: Shift+d — buffer becomes 'fd', exact match for the spell.
    h.pressKey('d', ['Shift']);

    // The 'fd' spell is now selected.
    expect(h.selectedRowName()).toBe('Summoning Circle');
    // Buffer indicator shows 'fd' (normal, green).
    const indicatorAfterFd = h.contentEl.querySelector(
      '.modal-tab-bar-right .hotkey-buffer-indicator',
    );
    expect(indicatorAfterFd).not.toBeNull();
    expect(indicatorAfterFd?.classList.contains('is-error')).toBe(false);
    expect(
      indicatorAfterFd?.querySelector('.hotkey-buffer-letters')?.textContent,
    ).toBe('fd');
  });

  // (v) Hotkey press while search has text typed clears query and focuses Forge ----

  it('(v) Shift+f while search has filtered to a spell (not Forge) clears the search and focuses Forge', () => {
    const h = createPopupHarness();

    // Type 'protect' — this matches 'Protection Rune' (a spell), so the selection
    // lands on that spell, not on Forge. The search input is non-empty.
    h.type('protect');
    expect(h.searchInput().value).toBe('protect');
    // Confirm Forge is NOT currently selected (Protection Rune is)
    expect(h.selectedRowName()).toBe('Protection Rune');

    h.pressKey('f', ['Shift']);

    // Search must be cleared after the hotkey fires
    expect(h.searchInput().value).toBe('');
    // Forge must now be selected
    expect(h.selectedRowName()).toBe('Forge');
  });
});
