/**
 * Integration test: spell hotkeys chrome — badge presence/absence + hint-slot behaviour.
 *
 * Seam: CommandPopup (parent) ↔ SpellRow / SentinelRow / TabBar (real children).
 * No child components are mocked; all assertions are on user-visible DOM output.
 *
 * RED: all seven cases fail because:
 *  - E1/E2/E3 (badge rendering) are not implemented — `.spell-hotkey-badge` is
 *    never created inside `.spells-row-name` or `.sentinel-row`.
 *  - E4/E5 (HotkeyHintSlot + TabBar right slot) are not implemented —
 *    `.modal-tab-bar-right` and `.hotkey-hint` are never injected into the DOM.
 *
 * Tests must not fail due to import errors — they go through the harness only.
 */

import { describe, it, expect } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a harness where one specific file carries a `grimoire-hotkey` value
 * in its frontmatter. All other files carry only `{ tags: ['spell'] }`.
 * Mirrors the pattern from spell-hotkeys-capture.spec.ts.
 */
function createHarnessWithHotkey(
  hotkeyFile: { basename: string; path: string },
  hotkey: string,
): PopupHarness {
  const h = createPopupHarness();

  (h.modal.app as any).metadataCache.getFileCache.mockImplementation(
    (file: { path: string }) => {
      if (file.path === hotkeyFile.path) {
        return { frontmatter: { tags: ['spell'], 'grimoire-hotkey': hotkey } };
      }
      return { frontmatter: { tags: ['spell'] } };
    },
  );

  // Re-open so the new mock is active when spells are scanned
  h.modal.close();
  h.modal.open();

  return h;
}

// ---------------------------------------------------------------------------
// Badge presence / absence tests
// ---------------------------------------------------------------------------

describe('spell hotkeys chrome — badge presence/absence', () => {
  // (1) Spell with grimoire-hotkey: 'g' renders .spell-hotkey-badge text 'g' ----

  it('(1) spell with grimoire-hotkey: g renders a .spell-hotkey-badge with text "g" in its row', () => {
    const h = createHarnessWithHotkey(
      { basename: 'Summoning Circle', path: '/spells/summoning.md' },
      'g',
    );

    // Find the spell row for Summoning Circle
    const rows = h.visibleSpellRows();
    const summoningRow = rows.find(
      (r) => r.querySelector('span:first-child')?.textContent === 'Summoning Circle',
    );

    expect(summoningRow).not.toBeUndefined();

    const badge = summoningRow!.querySelector('.spell-hotkey-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('g');
  });

  // (2) Spell with no grimoire-hotkey does NOT render .spell-hotkey-badge ------

  it('(2) spell with no grimoire-hotkey frontmatter key does not render .spell-hotkey-badge', () => {
    const h = createHarnessWithHotkey(
      { basename: 'Summoning Circle', path: '/spells/summoning.md' },
      'g',
    );

    // Protection Rune has no hotkey set — check it has no badge
    const rows = h.visibleSpellRows();
    const protectionRow = rows.find(
      (r) => r.querySelector('span:first-child')?.textContent === 'Protection Rune',
    );

    expect(protectionRow).not.toBeUndefined();

    const badge = protectionRow!.querySelector('.spell-hotkey-badge');
    expect(badge).toBeNull();
  });

  // (3) Forge sentinel row renders .spell-hotkey-badge text 'f' ---------------

  it('(3) Forge sentinel row renders a .spell-hotkey-badge with text "f"', () => {
    const h = createPopupHarness();

    const sentinelRows = h.visibleSentinelRows();
    const forgeRow = sentinelRows.find(
      (r) => r.querySelector('.sentinel-name')?.textContent === 'Forge',
    );

    expect(forgeRow).not.toBeUndefined();

    const badge = forgeRow!.querySelector('.spell-hotkey-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('f');
  });

  // (4) Refine sentinel row renders .spell-hotkey-badge text 'r' --------------

  it('(4) Refine sentinel row renders a .spell-hotkey-badge with text "r"', () => {
    const h = createPopupHarness();

    const sentinelRows = h.visibleSentinelRows();
    const refineRow = sentinelRows.find(
      (r) => r.querySelector('.sentinel-name')?.textContent === 'Refine',
    );

    expect(refineRow).not.toBeUndefined();

    const badge = refineRow!.querySelector('.spell-hotkey-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('r');
  });
});

// ---------------------------------------------------------------------------
// Spell row layout: badge is a direct flex child of .spells-row (not inside nameBlock)
// ---------------------------------------------------------------------------

describe('spell hotkeys chrome — spell row layout (badge as direct flex child)', () => {
  // (10) Spell row with a hotkey: badge is a direct child of .spells-row,
  //      NOT nested inside .spells-row-name, and the row has class has-hotkey.

  it('(10) spell row with a hotkey: .spell-hotkey-badge is a direct child of .spells-row and row has class has-hotkey', () => {
    const h = createHarnessWithHotkey(
      { basename: 'Summoning Circle', path: '/spells/summoning.md' },
      'g',
    );

    const rows = h.visibleSpellRows();
    const summoningRow = rows.find(
      (r) => r.querySelector('span:first-child')?.textContent === 'Summoning Circle',
    );

    expect(summoningRow).not.toBeUndefined();

    // Row must carry the has-hotkey class
    expect(summoningRow!.classList.contains('has-hotkey')).toBe(true);

    // Badge must be a direct child of .spells-row, not buried in .spells-row-name
    const directBadge = summoningRow!.querySelector(':scope > .spell-hotkey-badge');
    expect(directBadge).not.toBeNull();
    expect(directBadge!.textContent).toBe('g');

    // And must NOT be inside .spells-row-name
    const nameBlock = summoningRow!.querySelector('.spells-row-name');
    expect(nameBlock).not.toBeNull();
    const badgeInsideName = nameBlock!.querySelector('.spell-hotkey-badge');
    expect(badgeInsideName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Badge visibility on sentinel rows (Refine case)
// ---------------------------------------------------------------------------

describe('spell hotkeys chrome — badge visibility on selection', () => {
  // (8) Refine sentinel row: badge is present without selection,
  // absent (or hidden) when .is-selected is applied

  it('(8) Refine sentinel row: .spell-hotkey-badge is present without .is-selected', () => {
    const h = createPopupHarness();

    const sentinelRows = h.visibleSentinelRows();
    const refineRow = sentinelRows.find(
      (r) => r.querySelector('.sentinel-name')?.textContent === 'Refine',
    );

    expect(refineRow).not.toBeUndefined();

    // Before selection, badge must exist in the DOM
    const badge = refineRow!.querySelector('.spell-hotkey-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('r');
  });

  it('(8b) Refine sentinel row: .spell-hotkey-badge element exists, CSS rule hides it on .is-selected', () => {
    const h = createPopupHarness();

    const sentinelRows = h.visibleSentinelRows();
    const refineRow = sentinelRows.find(
      (r) => r.querySelector('.sentinel-name')?.textContent === 'Refine',
    );

    expect(refineRow).not.toBeUndefined();

    // Verify badge element exists before selection (it should be in the DOM)
    const badge = refineRow!.querySelector('.spell-hotkey-badge');
    expect(badge).not.toBeNull();

    // Apply .is-selected to simulate keyboard selection state
    refineRow!.classList.add('is-selected');

    // Badge should still exist in DOM (CSS hides it via display:none).
    // happy-dom doesn't fully evaluate CSS, so we can't assert getComputedStyle.
    // The structural test verifies the badge element is present;
    // the CSS rule in styles.css (verified in source) provides the visual hiding.
    const badgeAfterSelection = refineRow!.querySelector('.spell-hotkey-badge');
    expect(badgeAfterSelection).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sentinel row layout: badge + hint coexist in DOM, CSS handles alternation
// ---------------------------------------------------------------------------

describe('spell hotkeys chrome — sentinel row layout (badge + hint coexist)', () => {
  // (9) Refine sentinel row has both .spell-hotkey-badge and .spells-row-hint in the DOM
  // simultaneously. The CSS fix (display:none + margin-left:auto) alternates their
  // visibility without removing either from the DOM.

  it('(9) Refine sentinel row: .spell-hotkey-badge and .spells-row-hint are both present in the DOM when not selected', () => {
    const h = createPopupHarness();

    const sentinelRows = h.visibleSentinelRows();
    const refineRow = sentinelRows.find(
      (r) => r.querySelector('.sentinel-name')?.textContent === 'Refine',
    );

    expect(refineRow).not.toBeUndefined();

    // Both elements must exist in the DOM — CSS handles the visual alternation
    const badge = refineRow!.querySelector('.spell-hotkey-badge');
    const hint = refineRow!.querySelector('.spells-row-hint');

    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('r');
    expect(hint).not.toBeNull();
  });

  it('(9b) Refine sentinel row: .spell-hotkey-badge and .spells-row-hint are both present in the DOM when selected', () => {
    const h = createPopupHarness();

    const sentinelRows = h.visibleSentinelRows();
    const refineRow = sentinelRows.find(
      (r) => r.querySelector('.sentinel-name')?.textContent === 'Refine',
    );

    expect(refineRow).not.toBeUndefined();

    refineRow!.classList.add('is-selected');

    // Both must still be in the DOM after selection — CSS handles the visual swap
    const badge = refineRow!.querySelector('.spell-hotkey-badge');
    const hint = refineRow!.querySelector('.spells-row-hint');

    expect(badge).not.toBeNull();
    expect(hint).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hint-slot behaviour tests
// ---------------------------------------------------------------------------

describe('spell hotkeys chrome — hint-slot behaviour', () => {
  // (5) On initial popup open, .modal-tab-bar-right .hotkey-hint is present ----

  it('(5) on initial popup open, .modal-tab-bar-right .hotkey-hint is present with hint text', () => {
    const h = createPopupHarness();

    const hintEl = h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint');
    expect(hintEl).not.toBeNull();
    expect(hintEl!.textContent).toMatch(/Shift \+ letters for hotkeys/i);
  });

  // (6) Clicking the Logs tab hides / removes the hint slot content -----------

  it('(6) clicking the Logs tab hides the hotkey-hint element', () => {
    const h = createPopupHarness();

    h.clickTab('logs');

    // After switching to Logs, the hint must not be visible in the right slot.
    // Either the element is removed from the DOM or the slot is empty.
    const hintEl = h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint');
    expect(hintEl).toBeNull();
  });

  // (7) Switching back to Spells tab restores the hint ----------------------

  it('(7) switching back to Spells tab restores the .hotkey-hint in the right slot', () => {
    const h = createPopupHarness();

    h.clickTab('logs');
    h.clickTab('spells');

    const hintEl = h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint');
    expect(hintEl).not.toBeNull();
    expect(hintEl!.textContent).toMatch(/Shift \+ letters for hotkeys/i);
  });
});
