import { describe, it, expect, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

function enterForgeDetail(h: PopupHarness): void {
  h.pressKey('ArrowUp'); // 0 → 11 (Refine)
  h.pressKey('ArrowUp'); // 11 → 10 (Forge)
  h.pressKey('Enter');   // opens Forge detail, suspends popup kb
}

describe('keyboard suspend/resume across forge detail', () => {
  let h: PopupHarness;

  beforeEach(() => {
    h = createPopupHarness();
  });

  it('E1: during Forge detail Tab returns false and Enter returns false (popup kb suspended)', () => {
    enterForgeDetail(h);
    // Confirm forge form is active (popup kb suspended)
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeTruthy();

    const tabResult = h.pressKey('Tab');
    expect(tabResult).toBe(false);

    const enterResult = h.pressKey('Enter');
    expect(enterResult).toBe(false);
  });

  it('E2: after clickBack from Forge detail, ArrowDown advances selection from restored index', () => {
    enterForgeDetail(h);
    h.clickBack(); // exitDetail() → kb.resume(), renderSearch() restores selectedIndex=10 (Forge)

    // Popup kb is resumed — selection memory restores to index 10 (Forge).
    // ArrowDown from 10 → 11 (Refine), not 1 — pinning actual behavior.
    expect(h.pressKey('ArrowDown')).toBe(true);
    expect(h.selectedRowName()).toBe('Refine');
  });

  it('E3: resume works after two full suspend/resume cycles', () => {
    // First cycle: enter Forge at index 10, exit
    enterForgeDetail(h);
    h.clickBack(); // selectedIndex restored to 10 (Forge)

    // After first exit, selectedIndex is 10 (Forge) — press Enter directly to re-enter
    h.pressKey('Enter');
    // Second cycle — suspended again, forge form mounted
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeTruthy();

    h.clickBack(); // second resume

    // ArrowDown should still work after second resume — advances from 10 to 11 (Refine)
    expect(h.pressKey('ArrowDown')).toBe(true);
    expect(h.selectedRowName()).toBe('Refine');
  });
});
