import { describe, it, expect, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

describe('tab navigation', () => {
  let h: PopupHarness;

  beforeEach(() => {
    h = createPopupHarness();
  });

  it('B1: pressKey Tab cycles activeTabId spells→logs→spells across two presses, each returning true', () => {
    expect(h.activeTabId()).toBe('spells');

    const first = h.pressKey('Tab');
    expect(first).toBe(true);
    expect(h.activeTabId()).toBe('logs');

    const second = h.pressKey('Tab');
    expect(second).toBe(true);
    expect(h.activeTabId()).toBe('spells');
  });

  it('B2: clickTab logs switches activeTabId to logs without search input', () => {
    h.type('circle');
    h.clickTab('logs');

    expect(h.activeTabId()).toBe('logs');
    // Logs tab has no search input, so we cannot call h.searchInput()
    // Verify we're on the logs tab by checking for the cast-log-list element
    const castLogList = h.contentEl.querySelector('.cast-log-list');
    expect(castLogList).not.toBeNull();
  });

  it('B3: clickTab logs then clickTab spells returns to Spells with first spell selected', () => {
    h.clickTab('logs');
    h.clickTab('spells');

    expect(h.activeTabId()).toBe('spells');
    expect(h.selectedRowName()).toBe('Banishment Hex');
  });

});
