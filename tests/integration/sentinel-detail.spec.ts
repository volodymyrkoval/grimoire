import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  let castActionSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    castActionSpy = vi.fn();
    h = createPopupHarness({ castAction: castActionSpy });
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

  it('D4: Enter on Refine fully closes the modal (no detail, no cast)', () => {
    // refineCastAction is created fresh in this test to capture it and make it dismiss
    const refineCastActionSpy = vi.fn((snap) => h.modal.dismiss());
    h = createPopupHarness({ castAction: castActionSpy, refineCastAction: refineCastActionSpy });

    navigateToRefine(h);
    h.pressKey('Enter');

    // Modal removed from DOM entirely
    expect(h.modal.containerEl.parentElement).toBe(null);
    // Cast was NOT called, but refineCastAction was
    expect(castActionSpy).not.toHaveBeenCalled();
    expect(refineCastActionSpy).toHaveBeenCalledOnce();
  });
});
