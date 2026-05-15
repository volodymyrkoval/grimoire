import { describe, it, expect, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

describe('modal lifecycle', () => {
  let h: PopupHarness;

  beforeEach(() => {
    h = createPopupHarness();
  });

  it('F5: close and reopen resets tab and search value to initial state', () => {
    // Mutate state: type something in search on spells tab
    h.type('circle');
    expect(h.searchInput().value).toBe('circle');

    // Close from search phase — super.close() is called, removing contentEl from DOM
    h.modal.close();
    // Reopen — onOpen() resets all state
    h.modal.open();

    expect(h.activeTabId()).toBe('spells');
    expect(h.searchInput().value).toBe('');
    // After reopening, a spell row should be selected
    expect(h.selectedRow()).not.toBeNull();
  });

  it('F6: close from search phase empties contentEl via onClose()', () => {
    expect(h.contentEl.children.length).toBeGreaterThan(0);

    h.modal.close(); // super.close() → onClose() empties contentEl, then contentEl.remove()

    expect(h.contentEl.children.length).toBe(0);
  });
});
