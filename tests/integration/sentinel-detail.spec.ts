import { describe, it, expect, beforeEach } from 'vitest';
import { createPopupHarness, type PopupHarness } from './harness';

// ArrowUp from index 0 wraps to 11 (Refine), again to 10 (Forge).
function navigateToForge(h: PopupHarness): void {
  h.pressKey('ArrowUp'); // 0 → 11 (Refine)
  h.pressKey('ArrowUp'); // 11 → 10 (Forge)
}

function navigateToRefine(h: PopupHarness): void {
  h.pressKey('ArrowUp'); // 0 → 11 (Refine)
}

describe('sentinel detail', () => {
  let h: PopupHarness;

  beforeEach(() => {
    h = createPopupHarness();
  });

  it('D2: navigate to Forge and Enter opens forge form; clickBack exits to search', () => {
    navigateToForge(h);
    h.pressKey('Enter');

    // isInDetail() returns false for forge because the forge form contains input[type=text]
    // Pin actual behavior: form is mounted
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeTruthy();
    // No search input placeholder (forge form's input has no "Search" placeholder)
    expect(h.contentEl.querySelector('input[placeholder*="Search"]')).toBeNull();

    h.clickBack();

    // After back: search input is restored
    expect(h.searchInput()).toBeTruthy();
    expect(h.contentEl.isConnected).toBe(true);
  });

  it('D3: enter Forge detail and submitForge exits to search', () => {
    navigateToForge(h);
    h.pressKey('Enter');
    // Forge form is mounted (forge detail is active)
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeTruthy();

    h.submitForge({ name: 'TestSpell' });

    // After submit: search input is restored, forge form is gone
    expect(h.searchInput()).toBeTruthy();
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeNull();
  });

  it('D4: navigate to Refine and Enter shows h2 Refine and p with Type: refine; clickBack exits', () => {
    navigateToRefine(h);
    h.pressKey('Enter');

    expect(h.isInDetail()).toBe(true);
    const h2 = h.contentEl.querySelector('h2');
    expect(h2?.textContent).toBe('Refine');
    const p = h.contentEl.querySelector('p');
    expect(p?.textContent).toContain('Type: refine');

    h.clickBack();

    expect(h.isInDetail()).toBe(false);
  });

  it('D5: modal.close() from Refine detail routes through override and exits to search without DOM removal', () => {
    navigateToRefine(h);
    h.pressKey('Enter');
    expect(h.isInDetail()).toBe(true);

    h.modal.close();

    // override intercepts: calls onDetailBack (renderSearch), does NOT call super.close()
    expect(h.isInDetail()).toBe(false);
    expect(h.contentEl.isConnected).toBe(true);
  });
});
