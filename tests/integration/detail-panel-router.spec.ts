/**
 * Integration test: CommandPopup detail-panel routing seam.
 *
 * Seam: the boundary between CommandPopup (parent) and its three real
 * detail-panel children — SpellOptionsDetail, RefineOptionsDetail,
 * ForgeSentinelDetail.  These tests pin the three routing paths before
 * F8/F9 extract them into a separate DetailPanelRouter class.
 *
 * After F8/F9: harness construction may need to pass DetailPanelRouter deps
 * separately — see this test for the seam.
 *
 * Routes pinned here:
 *   Route 1 — spell row → ArrowRight → spell-options panel
 *             → Cast fires castAction
 *             → Back routes to search   ← MISSING from other specs; added here
 *   Route 2 — refine sentinel → ArrowRight → refine-options panel
 *             → Cast fires refineCastAction           (covered elsewhere too)
 *             → Back routes to search                 (covered elsewhere too)
 *   Route 3 — forge sentinel → Enter → forge form
 *             → Submit fires imprintAction             (covered elsewhere too)
 *             → Back routes to search                 (covered elsewhere too)
 *
 * Navigation note (shared harness has 10 spells + 2 sentinels = 12 rows):
 *   index  0..9  — spell rows (sorted alphabetically)
 *   index 10     — Forge sentinel
 *   index 11     — Refine sentinel
 *   ArrowUp from 0 wraps to 11 (Refine); again to 10 (Forge).
 */

import { describe, it, expect, vi } from 'vitest';
import { modelId } from '../../src/domain/settings/ModelId';
import { createPopupHarness } from './harness';
import type { CastAction, RefineCastAction, ImprintAction } from '../../src/ui/CommandPopup';

// ─── Route 1: spell → spell-options panel ────────────────────────────────────

describe('detail-panel-router — Route 1: spell row → spell-options panel', () => {
  // ── R1-Cast: ArrowRight on spell row → options panel → Cast fires castAction ──
  it('ArrowRight on spell row opens options panel and Cast button fires castAction with spell + snapshot', () => {
    const castAction: CastAction = vi.fn();
    const h = createPopupHarness({ castAction });

    // index 0 = Banishment Hex (first alphabetically)
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    form.dispatchEvent(new Event('submit'));

    expect(castAction).toHaveBeenCalledOnce();
    const [spellArg, snapshotArg] = (castAction as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(spellArg).toMatchObject({ name: 'Banishment Hex', path: '/spells/banishment.md' });
    expect(snapshotArg).toMatchObject({
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
    });
  });

  // ── R1-Back: ArrowRight on spell row → Back button → returns to search ───────
  it('ArrowRight on spell row opens options panel and Back button returns to search phase', () => {
    const h = createPopupHarness();

    h.pressKey('ArrowRight');

    // Options panel is mounted
    expect(h.contentEl.querySelector('form.options-panel')).not.toBeNull();

    // Click the back button inside the options panel
    h.clickBack();

    // Modal is still alive
    expect(h.contentEl.isConnected).toBe(true);

    // Options panel is gone
    expect(h.contentEl.querySelector('form.options-panel')).toBeNull();

    // Search input is restored — we're back in search phase
    expect(h.searchInput()).not.toBeNull();
  });
});

// ─── Route 2: refine sentinel → refine-options panel ─────────────────────────

describe('detail-panel-router — Route 2: refine sentinel → refine-options panel', () => {
  // ── R2-Cast ───────────────────────────────────────────────────────────────────
  it('ArrowRight on Refine sentinel opens options panel and Cast button fires refineCastAction', () => {
    const refineCastAction: RefineCastAction = vi.fn((snap) => h.modal.dismiss());
    const h = createPopupHarness({ refineCastAction });

    h.pressKey('ArrowUp'); // index 0 → wraps to 11 (Refine)
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();

    form.dispatchEvent(new Event('submit'));

    expect(refineCastAction).toHaveBeenCalledOnce();
    expect(refineCastAction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        effort: expect.any(String),
        contextNotePaths: expect.any(Array),
        followUp: expect.any(String),
      })
    );

    // Modal is fully removed from DOM
    expect(h.modal.containerEl.parentElement).toBeNull();
  });

  // ── R2-Back ───────────────────────────────────────────────────────────────────
  it('ArrowRight on Refine sentinel opens options panel and Back button returns to search phase', () => {
    const h = createPopupHarness();

    h.pressKey('ArrowUp'); // index 0 → wraps to 11 (Refine)
    h.pressKey('ArrowRight');

    expect(h.contentEl.querySelector('form.options-panel')).not.toBeNull();

    h.clickBack();

    expect(h.contentEl.isConnected).toBe(true);
    expect(h.contentEl.querySelector('form.options-panel')).toBeNull();
    expect(h.searchInput()).not.toBeNull();
  });
});

// ─── Route 3: forge sentinel → forge form ────────────────────────────────────

describe('detail-panel-router — Route 3: forge sentinel → forge form', () => {
  // ── R3-Submit: Enter on Forge sentinel → forge form → Submit fires imprintAction
  it('Enter on Forge sentinel opens forge form and Submit fires imprintAction with snapshot', () => {
    const imprintAction: ImprintAction = vi.fn();
    const h = createPopupHarness({ imprintAction });

    h.pressKey('ArrowUp'); // 0 → 11 (Refine)
    h.pressKey('ArrowUp'); // 11 → 10 (Forge)
    h.pressKey('Enter');   // opens forge form

    expect(h.contentEl.querySelector('form.forge-sentinel-form')).not.toBeNull();

    h.submitForge({ name: 'Conjured Rune', description: 'Test desc' });

    expect(imprintAction).toHaveBeenCalledOnce();
    expect(imprintAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Conjured Rune', description: 'Test desc' })
    );
  });

  // ── R3-Back: Enter on Forge → form → Back returns to search ──────────────────
  it('Enter on Forge sentinel opens forge form and Back button returns to search phase', () => {
    const h = createPopupHarness();

    h.pressKey('ArrowUp'); // 0 → 11 (Refine)
    h.pressKey('ArrowUp'); // 11 → 10 (Forge)
    h.pressKey('Enter');   // opens forge form

    expect(h.contentEl.querySelector('form.forge-sentinel-form')).not.toBeNull();

    h.clickBack();

    expect(h.contentEl.isConnected).toBe(true);
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeNull();
    expect(h.searchInput()).not.toBeNull();
  });

  // ── R3-ExitAfterSubmit: forge form closes detail phase on submit ──────────────
  it('submitting the forge form exits detail phase — modal stays open, form is gone', () => {
    const h = createPopupHarness();

    h.pressKey('ArrowUp'); // 0 → 11 (Refine)
    h.pressKey('ArrowUp'); // 11 → 10 (Forge)
    h.pressKey('Enter');

    h.submitForge({ name: 'PostSubmitSpell', description: 'desc' });

    // Form is gone
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeNull();

    // Search phase restored — modal is still connected
    expect(h.contentEl.isConnected).toBe(true);
    expect(h.searchInput()).not.toBeNull();
  });
});
