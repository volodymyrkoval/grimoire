import { describe, it, expect, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

describe('spell detail transitions', () => {
  let h: PopupHarness;

  beforeEach(() => {
    h = createPopupHarness();
  });

  it('C1: pressKey Enter on initial selection opens spell detail with h2 Banishment Hex', () => {
    h.pressKey('Enter');

    expect(h.isInDetail()).toBe(true);
    const h2 = h.contentEl.querySelector('h2');
    expect(h2?.textContent).toBe('Banishment Hex');
  });

  it('C2: modal.close() from spell detail exits to search without disconnecting contentEl', () => {
    h.pressKey('Enter');
    expect(h.isInDetail()).toBe(true);

    h.modal.close();

    expect(h.isInDetail()).toBe(false);
    expect(h.searchInput()).toBeTruthy();
    expect(h.contentEl.isConnected).toBe(true);
  });

  it('C3: clickBack from spell detail exits to search with contentEl still connected', () => {
    h.pressKey('Enter');
    expect(h.isInDetail()).toBe(true);

    h.clickBack();

    expect(h.isInDetail()).toBe(false);
    expect(h.searchInput()).toBeTruthy();
    expect(h.contentEl.isConnected).toBe(true);
  });

  it('C4: selection memory — enter detail at index 3, exit, selected row is Healing Incantation', () => {
    h.pressKey('ArrowDown');
    h.pressKey('ArrowDown');
    h.pressKey('ArrowDown');
    // Now at index 3 (Healing Incantation in alphabetical order)
    h.pressKey('Enter');
    expect(h.isInDetail()).toBe(true);

    h.modal.close();
    expect(h.isInDetail()).toBe(false);

    expect(h.selectedRow()?.textContent).toBe('Healing Incantation');
  });

  it('C5: close() override in detail phase never calls super.close() — contentEl remains in document', () => {
    // Enter detail
    h.pressKey('Enter');
    expect(h.isInDetail()).toBe(true);

    // Capture connected state before close
    expect(h.contentEl.isConnected).toBe(true);

    // close() should trigger the override: run onDetailBack, return without super.close()
    h.modal.close();

    // contentEl must still be in the document (super.close() was not called)
    expect(h.contentEl.isConnected).toBe(true);
    // And we are back in search phase
    expect(h.isInDetail()).toBe(false);
  });
});
