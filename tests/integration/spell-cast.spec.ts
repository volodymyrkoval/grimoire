/**
 * Integration test: CommandPopup spell-row → castAction callback.
 *
 * Seam: the boundary between CommandPopup (parent) and the SpellsPanel's row-click /
 * keyboard-confirm path. The castAction stub sits exactly at the seam — nothing below
 * it (CastDispatcher, Notice, spawn) is exercised here.
 *
 * RED until D1 (CastAction type), D2 (constructor fourth arg + renderDetail deleted),
 * and D3 (harness castAction option) land.
 *
 * Sort note: harness testFiles are sorted alphabetically by name (localeCompare, base
 * sensitivity) before being presented as rows. Sorted order:
 *   index 0 → Banishment Hex      (/spells/banishment.md)
 *   index 1 → Divination Ritual   (/spells/divination.md)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-expect-error CastAction is not yet exported — will be added by D1.
import type { CastAction } from '../../src/ui/CommandPopup';
import { createPopupHarness } from './harness';

describe('spell-cast integration — popup spell-row → castAction', () => {
  let castAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    castAction = vi.fn();
  });

  it('clicking the first spell row invokes castAction once with that spell', () => {
    // @ts-expect-error harness does not yet accept castAction — added by D3.
    const h = createPopupHarness({ castAction });

    h.clickRow(0);

    expect(castAction).toHaveBeenCalledOnce();
    expect(castAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Banishment Hex',
        path: '/spells/banishment.md',
      })
    );
  });

  it('pressing Enter on the highlighted first row invokes castAction once with that spell', () => {
    // @ts-expect-error harness does not yet accept castAction — added by D3.
    const h = createPopupHarness({ castAction });

    // On open, selectedIndex is 0 — first row is highlighted by default.
    h.pressKey('Enter');

    expect(castAction).toHaveBeenCalledOnce();
    expect(castAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Banishment Hex',
        path: '/spells/banishment.md',
      })
    );
  });

  it('ArrowDown then Enter dispatches castAction with the second spell', () => {
    // @ts-expect-error harness does not yet accept castAction — added by D3.
    const h = createPopupHarness({ castAction });

    h.pressKey('ArrowDown');
    h.pressKey('Enter');

    expect(castAction).toHaveBeenCalledOnce();
    expect(castAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Divination Ritual',
        path: '/spells/divination.md',
      })
    );
  });

  it('castAction is still called when workspace.getActiveFile returns null (workspace mock plumbing)', () => {
    // The popup does not resolve the active file — that is main.ts's responsibility.
    // This test verifies the workspace mock wiring does not break the integration seam.
    // @ts-expect-error harness does not yet accept castAction — added by D3.
    const h = createPopupHarness({ castAction });
    (h.modal.app as any).workspace.getActiveFile.mockReturnValue(null);

    h.clickRow(0);

    expect(castAction).toHaveBeenCalledOnce();
    expect(castAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Banishment Hex',
        path: '/spells/banishment.md',
      })
    );
  });
});
