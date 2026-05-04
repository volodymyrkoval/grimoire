import { describe, it, expect } from 'vitest';
import { createPopupHarness } from './harness';

describe('PopupHarness smoke', () => {
  it('mounts contentEl into the document', () => {
    const h = createPopupHarness();
    expect(h.contentEl.isConnected).toBe(true);
  });

  it('exposes a search input', () => {
    const h = createPopupHarness();
    expect(h.searchInput().placeholder).toMatch(/Search/);
  });

  it('pressKey ArrowDown returns true (key consumed)', () => {
    const h = createPopupHarness();
    expect(h.pressKey('ArrowDown')).toBe(true);
  });
});
