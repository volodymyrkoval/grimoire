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

  it('B2: clickTab logs switches activeTabId to logs and clears search input after typing', () => {
    h.type('circle');
    h.clickTab('logs');

    expect(h.activeTabId()).toBe('logs');
    expect(h.searchInput().value).toBe('');
  });

  it('B3: clickTab logs then clickTab spells returns to Spells with first spell selected', () => {
    h.clickTab('logs');
    h.clickTab('spells');

    expect(h.activeTabId()).toBe('spells');
    expect(h.selectedRowName()).toBe('Banishment Hex');
  });

});
