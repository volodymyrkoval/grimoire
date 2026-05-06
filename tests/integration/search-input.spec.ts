import { describe, it, expect, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

describe('search input filtering and navigation', () => {
  let h: PopupHarness;

  beforeEach(() => {
    h = createPopupHarness();
  });

  it('F1: type protect filters to one spell row; selected row is Protection Rune', () => {
    h.type('protect');

    expect(h.visibleSpellRows().length).toBe(1);
    expect(h.selectedRow()?.textContent).toBe('Protection Rune');
  });

  it('F3: ArrowUp from index 0 wraps to last row; selectedRow is Refine', () => {
    h.pressKey('ArrowUp'); // 0 → 11 (Refine)

    expect(h.selectedRow()?.textContent).toBe('Refine');
  });

  it('F4: type forge shows no spell rows and Forge sentinel is selected', () => {
    h.type('forge');

    expect(h.visibleSpellRows().length).toBe(0);
    expect(h.selectedRow()?.textContent).toBe('Forge');
  });
});
