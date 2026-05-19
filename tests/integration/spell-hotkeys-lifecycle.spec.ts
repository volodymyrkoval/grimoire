/**
 * Integration test: spell hotkeys lifecycle wiring (F0).
 *
 * Seam: CommandPopup (parent) ↔ HotkeyRegistry / HotkeyCapture / HotkeyHintSlot /
 * SpellsPanel / SearchPhase (real children, none mocked).
 *
 * All six cases target behaviours in section F that are not yet implemented:
 *   (i)   Collision Notice fired when two spells share the same hotkey.
 *   (ii)  Arrow key clears the buffer and restores the hint.
 *   (iii) Escape with non-empty buffer clears the buffer; modal stays open.
 *   (iv)  Escape with empty buffer closes the modal.
 *   (v)   Entering detail phase clears the buffer and hides the slot; exiting
 *         restores the hint.
 *   (vi)  Switching to Logs uninstalls capture (Shift+letter on Logs has no
 *         effect); switching back to Spells reinstalls it.
 *
 * RED: all six cases fail because F1–F5 production wiring is absent:
 *   - No collision Notice is emitted on popup open (F5).
 *   - SearchPhase.handleArrow has no buffer-clear step (F3).
 *   - No Escape binding exists in CommandPopup.#bindKeys (F3).
 *   - #enterDetail does not call buffer.clear() or hintSlot.hide() (F4).
 *   - #switchTab does not call capture.uninstall() on Logs tab (F4).
 *
 * Tests must not fail due to import errors — they go through the harness only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';
import { Notice } from 'obsidian';

// ---------------------------------------------------------------------------
// Local DOM helpers
// ---------------------------------------------------------------------------

/** Returns the `.hotkey-hint` element inside the right-slot, or null. */
function hintEl(h: PopupHarness): Element | null {
  return h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint');
}

/** Returns the `.hotkey-buffer-indicator` element, or null. */
function bufferIndicatorEl(h: PopupHarness): Element | null {
  return h.contentEl.querySelector('.hotkey-buffer-indicator');
}

/** Returns true when the hint is present and the buffer indicator is absent. */
function isHintVisible(h: PopupHarness): boolean {
  return hintEl(h) !== null && bufferIndicatorEl(h) === null;
}

/** Returns true when the buffer indicator is present and the hint is absent. */
function isBufferIndicatorVisible(h: PopupHarness): boolean {
  return bufferIndicatorEl(h) !== null;
}

// ---------------------------------------------------------------------------
// Harness factory: two spells sharing the same hotkey 'g'
// ---------------------------------------------------------------------------

/**
 * Opens a popup where 'Summoning Circle' and 'Protection Rune' both declare
 * `grimoire-hotkey: g`.  Used for the collision Notice test (case i).
 */
function createCollidingHarness(): PopupHarness {
  // Start with a fresh harness; metadataCache will be replaced before open.
  const h = createPopupHarness();
  const app = h.modal.app as any;

  app.metadataCache.getFileCache.mockImplementation(
    (file: { path: string }) => {
      if (
        file.path === '/spells/summoning.md' ||
        file.path === '/spells/protection.md'
      ) {
        return { frontmatter: { tags: ['spell'], 'grimoire-hotkey': 'g' } };
      }
      return { frontmatter: { tags: ['spell'] } };
    },
  );

  // Re-open so the new mock is active when spells are scanned and the
  // HotkeyRegistry is built.
  h.modal.close();
  Notice.instances = [];   // flush stale notices before the open we care about
  h.modal.open();

  return h;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// W1: double vault scan
// ---------------------------------------------------------------------------

describe('W1 — single vault scan on popup open', () => {
  it('onOpen triggers exactly one vault scan (getMarkdownFiles called once, not twice)', () => {
    const h = createPopupHarness();
    const app = h.modal.app as any;

    // Reset call count after initial open()
    app.vault.getMarkdownFiles.mockClear();

    // Close and re-open to get a clean scan measurement
    h.modal.close();
    h.modal.open();

    // refreshSpells() and #buildHotkeyCapture() used to each call getSpells separately.
    // After the fix, only one scan should occur per open.
    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);

    h.modal.close();
  });
});

// ---------------------------------------------------------------------------
// W4: HotkeyHintSlot re-instantiated on every render
// ---------------------------------------------------------------------------

describe('W4 — HotkeyHintSlot survives #render() calls within a popup session', () => {
  it('hint slot survives #render() and reflects buffer state after exact match', () => {
    // Arrange: open a fresh popup on the Spells tab.
    const h = createPopupHarness();

    // Guard: initial hint is visible.
    const hintBefore = h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint');
    expect(hintBefore).not.toBeNull();

    // Act: press Shift+f — exact match for Forge.
    // Under the hood: HotkeyCapture calls #focusRow(Forge_index) which calls
    // #render(). Before the W4 fix, #render() replaced #hintSlot with a new
    // empty one, so subsequent renders wrote into a container that was no
    // longer connected to the tab bar in use.
    h.pressKey('f', ['Shift']); // exact match → #focusRow → #render()

    // After firing, the buffer retains 'f' with 'normal' status — the slot
    // must hold the buffer indicator (not the hint), and the indicator must
    // be live in the DOM. This proves the slot survived #render().
    const indicatorAfter = h.contentEl.querySelector(
      '.modal-tab-bar-right .hotkey-buffer-indicator',
    );
    expect(indicatorAfter).not.toBeNull();
    expect(indicatorAfter?.classList.contains('is-error')).toBe(false);
    const lettersEl = indicatorAfter?.querySelector('.hotkey-buffer-letters');
    expect(lettersEl?.textContent).toBe('f');

    // The selection must have moved to Forge (hotkey fired correctly).
    expect(h.selectedRowName()).toBe('Forge');

    h.modal.close();
  });

  it('hint slot shows hint on Spells tab after tab-switch round-trip (Spells → Logs → Spells)', () => {
    // Each switchTab calls #render() which creates a new TabBar (and used to
    // create a new HotkeyHintSlot that immediately lost state).
    const h = createPopupHarness();

    // Spells tab: hint should be visible initially.
    expect(h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint')).not.toBeNull();

    // Switch to Logs — hint hides.
    h.clickTab('logs');
    expect(h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint')).toBeNull();

    // Switch back to Spells — hint must be restored by the wiring, not lost.
    h.clickTab('spells');
    expect(h.contentEl.querySelector('.modal-tab-bar-right .hotkey-hint')).not.toBeNull();

    h.modal.close();
  });
});

// ---------------------------------------------------------------------------
// S1: HotkeyCapture uses injected KeyboardController
// ---------------------------------------------------------------------------

describe('S1 — HotkeyCapture uses popup kb: kb.suspend() disables capture bindings', () => {
  it('Shift+f is a no-op while in Forge detail phase (capture suspended via shared kb)', () => {
    const h = createPopupHarness();

    // Navigate to Forge and enter detail — this calls kb.suspend() on the popup's #kb.
    // Because HotkeyCapture uses the same #kb, its bindings are also suspended.
    h.pressKey('ArrowUp'); // wrap to Refine sentinel
    h.pressKey('ArrowUp'); // → Forge sentinel
    expect(h.selectedRowName()).toBe('Forge');
    h.pressKey('Enter');   // enter Forge detail → kb.suspend()

    // Guard: we're in detail phase.
    const forgeForm = h.contentEl.querySelector('form.forge-sentinel-form');
    expect(forgeForm).not.toBeNull();

    // With separate kb (old S1 bug): Shift+f would fire capture bindings
    // (separate controller not suspended) and call focusRow.
    // With injected popup kb: Shift+f is consumed by nothing → no buffer indicator.
    const indicatorBefore = h.contentEl.querySelector('.hotkey-buffer-indicator');
    expect(indicatorBefore).toBeNull(); // slot is hidden during detail

    // Press Shift+f — if capture were active this would focus Forge (but we're
    // already in the Forge detail). With S1 fix, the binding is not on scope.
    h.pressKey('f', ['Shift']);

    // The indicator must NOT appear — capture bindings are suspended.
    const indicatorAfter = h.contentEl.querySelector('.hotkey-buffer-indicator');
    expect(indicatorAfter).toBeNull();

    // Forge form must still be showing (not accidentally closed).
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).not.toBeNull();

    h.modal.close();
  });
});

describe('spell hotkeys lifecycle wiring (F0)', () => {

  beforeEach(() => {
    // Reset Notice.instances before each test to isolate case (i).
    Notice.instances = [];
  });

  // (i) Collision Notice --------------------------------------------------

  it('(i) on popup open with two spells sharing hotkey "g", exactly one Notice is created whose message contains "g" and at least one of the spell names', () => {
    const h = createCollidingHarness();

    // The registry is built inside CommandPopup on open.  A collision Notice
    // must be fired once, naming the duplicated hotkey ('g') and at least one
    // of the two spell owners.
    const collisionNotices = Notice.instances.filter(
      (n) => n.message.includes('g'),
    );

    expect(collisionNotices).toHaveLength(1);

    const msg = collisionNotices[0].message;
    const mentionsEitherSpell =
      msg.includes('Summoning Circle') || msg.includes('Protection Rune');
    expect(mentionsEitherSpell).toBe(true);

    // Teardown
    h.modal.close();
  });

  // (ii) Arrow key clears buffer ------------------------------------------

  it('(ii) pressing ArrowDown while buffer is non-empty clears the buffer, restores the hint, and advances the selection', () => {
    const h = createPopupHarness();

    // Put a miss in the buffer so the indicator is visible.
    h.pressKey('x', ['Shift']); // 'x' is not registered → error state

    expect(isBufferIndicatorVisible(h)).toBe(true);

    const selectionBefore = h.selectedRowName();

    h.pressKey('ArrowDown');

    // Buffer must be cleared: indicator gone, hint restored.
    expect(bufferIndicatorEl(h)).toBeNull();
    expect(hintEl(h)).not.toBeNull();

    // Arrow navigation must still have advanced the selection.
    expect(h.selectedRowName()).not.toBe(selectionBefore);
  });

  // (iii) Escape clears buffer, modal stays open --------------------------

  it('(iii) pressing Escape while buffer is non-empty clears the buffer and keeps the modal open', () => {
    const h = createPopupHarness();

    // Build up a buffer ('x' → error state).
    h.pressKey('x', ['Shift']);

    expect(isBufferIndicatorVisible(h)).toBe(true);

    h.pressKey('Escape');

    // Buffer must be gone; hint must be visible.
    expect(bufferIndicatorEl(h)).toBeNull();
    expect(hintEl(h)).not.toBeNull();

    // Modal must remain open — Escape should not close it when buffer had content.
    expect(h.contentEl.isConnected).toBe(true);
  });

  // (iii-real) Same behaviour, but with Modal's built-in Escape→close()
  // handler registered FIRST on the Scope — mirroring real Obsidian, where
  // Modal binds Escape→this.close() inside its constructor (before onOpen()).
  // Real Obsidian dispatches FIFO, so without an interceptor in CommandPopup
  // the built-in handler closes the modal before the buffer-clear binding can
  // run. This test pins the fix: CommandPopup.close() must short-circuit when
  // the hotkey buffer is non-empty.
  it('(iii-real) FIFO Scope with built-in Escape→close(): non-empty buffer keeps modal open and clears buffer', () => {
    const h = createPopupHarness();

    // Re-open the modal so we can register the built-in Escape→close handler
    // BEFORE onOpen() runs (matching what Modal's constructor does in real Obsidian).
    h.modal.close();

    const scope = h.modal.scope as unknown as {
      register: (mods: string[], key: string, handler: (e: KeyboardEvent) => boolean | undefined) => unknown;
    };
    scope.register([], 'Escape', () => {
      h.modal.close();
      return false;
    });

    h.modal.open();

    // Build up a buffer ('x' → error state).
    h.pressKey('x', ['Shift']);

    expect(isBufferIndicatorVisible(h)).toBe(true);

    h.pressKey('Escape');

    // Buffer must be gone; hint must be visible.
    expect(bufferIndicatorEl(h)).toBeNull();
    expect(hintEl(h)).not.toBeNull();

    // Modal must remain open — Escape should not close it when buffer had content.
    expect(h.contentEl.isConnected).toBe(true);
  });

  // (iv) Escape with empty buffer closes modal ----------------------------

  it('(iv) pressing Escape while buffer is empty closes the modal', () => {
    const h = createPopupHarness();

    // Verify the buffer is empty at this point (no prior Shift+letter).
    expect(bufferIndicatorEl(h)).toBeNull();

    h.pressKey('Escape');

    // With an empty buffer, Escape must propagate to the default modal-close
    // behaviour.
    expect(h.contentEl.isConnected).toBe(false);
  });

  // (v) Detail phase clears buffer and restores hint on exit --------------

  it('(v) entering Forge detail clears the buffer and hides the hint slot; exiting detail restores the hint', () => {
    const h = createPopupHarness();

    // Build up a buffer ('x' → error state).
    h.pressKey('x', ['Shift']);

    expect(isBufferIndicatorVisible(h)).toBe(true);

    // Navigate to the Forge sentinel (ArrowUp from index 0 wraps to the end,
    // two more ArrowUps land on Forge — consistent with sentinel-detail.spec.ts).
    h.pressKey('ArrowUp'); // wrap to Refine
    h.pressKey('ArrowUp'); // → Forge

    expect(h.selectedRowName()).toBe('Forge');

    // Enter Forge detail.
    h.pressKey('Enter');

    // The forge form should now be mounted (detail phase is active).
    const forgeForm = h.contentEl.querySelector('form.forge-sentinel-form');
    expect(forgeForm).not.toBeNull();

    // During detail the buffer must be cleared and the hint slot must be hidden.
    expect(bufferIndicatorEl(h)).toBeNull();
    expect(hintEl(h)).toBeNull(); // slot is hidden during detail phase

    // Exit detail via back.
    h.clickBack();

    // After returning to search phase: hint must be restored, buffer still clear.
    expect(bufferIndicatorEl(h)).toBeNull();
    expect(hintEl(h)).not.toBeNull();
  });

  // (vi) Tab switch: capture uninstalled on Logs — Shift+letter is a no-op --

  it('(vi) pressing Shift+letter while on the Logs tab does not produce a buffer indicator', () => {
    const h = createPopupHarness();

    // Switch to Logs tab — capture must be uninstalled at this point.
    h.clickTab('logs');

    // On Logs, the hint slot should be hidden (no hint, no indicator).
    expect(hintEl(h)).toBeNull();
    expect(bufferIndicatorEl(h)).toBeNull();

    // With capture correctly uninstalled, pressing Shift+x on Logs is a no-op:
    // the buffer is not touched and no indicator appears.
    // With capture still active (current state), pressing Shift+x calls
    // buffer.append('x') → error state → renderIndicator → indicator appears
    // in the slot even though the slot was hidden.
    h.pressKey('x', ['Shift']);

    // The indicator must NOT appear on the Logs tab — capture is uninstalled.
    expect(bufferIndicatorEl(h)).toBeNull();
  });

  // (vii) Typing in search input clears the hotkey buffer indicator ----------

  it('(vii) typing a character into the search input after a buffer error clears the indicator and restores the hint', () => {
    const h = createPopupHarness();

    // Press Shift+x — 'x' is not registered → error indicator visible.
    h.pressKey('x', ['Shift']);
    expect(isBufferIndicatorVisible(h)).toBe(true);

    // Type a regular character into the search input.
    h.type('a');

    // The buffer indicator must be gone and the hint must be restored.
    expect(bufferIndicatorEl(h)).toBeNull();
    expect(hintEl(h)).not.toBeNull();

    // The search query should still be filtering (search input contains 'a').
    expect(h.searchInput().value).toBe('a');

    h.modal.close();
  });

});
