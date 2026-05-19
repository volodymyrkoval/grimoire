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

  it('B4: after switching to logs and back to spells, Tab key still cycles tabs', () => {
    h.clickTab('logs');
    h.clickTab('spells');
    expect(h.activeTabId()).toBe('spells');

    const handled = h.pressKey('Tab');

    expect(handled).toBe(true);
    expect(h.activeTabId()).toBe('logs');
  });

  // B5 — regression: clicking a tab while a detail panel is open used to leave
  // the popup in detail phase, which made #render() re-create the tab bar with
  // disablesTabBar()=true. Both tabs ended up dimmed and the keyboard scope
  // stayed suspended — a fully frozen popup. The switchTab handler must exit
  // detail phase first so the tab bar renders enabled and the keyboard resumes.
  it('B5: clicking logs tab while in detail phase switches tabs and restores keyboard', () => {
    h.pressKey('ArrowRight'); // open spell options → detail phase
    expect(h.contentEl.querySelector('form.options-panel')).not.toBeNull();

    h.clickTab('logs');

    // Options panel must be torn down — otherwise detail phase is leaked.
    expect(h.contentEl.querySelector('form.options-panel')).toBeNull();
    expect(h.activeTabId()).toBe('logs');
    // Tabs must not be disabled — a frozen popup leaves both tabs with is-disabled.
    const disabledTabs = h.contentEl.querySelectorAll('.modal-tab.is-disabled');
    expect(disabledTabs.length).toBe(0);
    // Keyboard scope must be resumed — Tab key cycles back to spells.
    const handled = h.pressKey('Tab');
    expect(handled).toBe(true);
    expect(h.activeTabId()).toBe('spells');
  });

});
