/**
 * Integration test: CastLogPanel — delete affordance at the row level.
 *
 * Seam: the boundary between CastLogPanel (parent) and its real children —
 * CastLogList, CastLogRow — via the injected deps surface, including the
 * FakeCastLogMutator supplied through CastLogPanelDeps.mutator.
 *
 * Expected DOM classes (D5 must emit these):
 *   .cast-log-delete-btn       — idle delete trigger in the row header
 *   .cast-log-delete-confirm   — confirm button shown while confirming
 *   .cast-log-delete-cancel    — cancel button shown while confirming
 *
 * RED until D2–D5 implement the delete affordance in CastLogRow / CastLogList
 * and the panel wires #pendingConfirmIds + onRequestConfirm / onCancelConfirm
 * / onDeleteCast callbacks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CastRecord } from '../../src/castLog/CastRecord';
import { CastLogPanel } from '../../src/ui/tabs/CastLogPanel';
import { App } from '../__mocks__/obsidian';

// ---------------------------------------------------------------------------
// Fake seam implementations — real children, fake injected deps only
// ---------------------------------------------------------------------------

class FakeCastLogSource {
  constructor(public records: CastRecord[]) {}
  async load(): Promise<CastRecord[]> {
    return this.records;
  }
}

class FakeRefreshCoordinator {
  private cb?: () => void;
  start(cb: () => void): void {
    this.cb = cb;
  }
  stop(): void {
    this.cb = undefined;
  }
  fire(): void {
    this.cb?.();
  }
}

class FakeTickCoordinator {
  private cb?: () => void;
  start(cb: () => void): void {
    this.cb = cb;
  }
  stop(): void {
    this.cb = undefined;
  }
  fire(): void {
    this.cb?.();
  }
}

class FakeCastLogMutator {
  deleteCast = vi.fn().mockResolvedValue(undefined);
  clearAll = vi.fn().mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Test records
// ---------------------------------------------------------------------------

const NOW_MS = Date.now();

const recordA: CastRecord = {
  castId: 'cast-a',
  status: 'in-progress',
  spellPath: 'Spells/Fireball.md',
  model: 'claude-opus-4-7',
  effort: null,
  contextNotes: ['Notes/context.md'],
  castedTs: new Date(NOW_MS - 60_000).toISOString(),
};

const recordB: CastRecord = {
  castId: 'cast-b',
  status: 'done',
  spellPath: '<forge>',
  model: 'claude-sonnet-4-6',
  effort: 'low',
  contextNotes: [],
  affectedFiles: ['Notes/result.md'],
  castedTs: new Date(NOW_MS - 120_000).toISOString(),
  endedTs: new Date(NOW_MS - 60_000).toISOString(),
};

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

const flushPromises = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface MountResult {
  container: HTMLElement;
  source: FakeCastLogSource;
  refresh: FakeRefreshCoordinator;
  tick: FakeTickCoordinator;
  mutator: FakeCastLogMutator;
  panel: CastLogPanel;
}

function mountPanel(records: CastRecord[], now?: () => Date): MountResult {
  const container = document.createElement('div');
  const source = new FakeCastLogSource(records);
  const refresh = new FakeRefreshCoordinator();
  const tick = new FakeTickCoordinator();
  const mutator = new FakeCastLogMutator();
  const nowFn = now ?? (() => new Date());

  const panel = new CastLogPanel({
    source,
    refresh,
    tick,
    openLink: vi.fn(),
    now: nowFn,
    mutator,
    app: new App(),
  });
  panel.mount(container);

  return { container, source, refresh, tick, mutator, panel };
}

// ---------------------------------------------------------------------------
// D5 — Delete affordance
// ---------------------------------------------------------------------------

describe('CastLogPanel — delete affordance', () => {
  // (a) Delete control present per row
  it('renders a delete button inside each cast row header', async () => {
    const { container } = mountPanel([recordA, recordB]);
    await flushPromises();

    const rows = container.querySelectorAll('.cast-log-row');
    expect(rows.length).toBeGreaterThanOrEqual(2);

    for (const row of Array.from(rows)) {
      const deleteBtn = row.querySelector('.cast-log-delete-btn');
      expect(deleteBtn).not.toBeNull();
    }
  });

  // (b) Clicking delete btn flips to confirm/cancel and does NOT toggle is-expanded
  it('clicking the delete button shows confirm/cancel and does not toggle expansion', async () => {
    const { container } = mountPanel([recordA, recordB]);
    await flushPromises();

    const rowA = Array.from(container.querySelectorAll('.cast-log-row')).find((r) =>
      r.textContent?.includes('Fireball')
    ) as HTMLElement | undefined;
    expect(rowA).toBeTruthy();

    // Row must not be expanded initially
    expect(rowA!.classList.contains('is-expanded')).toBe(false);

    const deleteBtn = rowA!.querySelector('.cast-log-delete-btn') as HTMLElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();

    // Expansion must NOT have been toggled
    expect(rowA!.classList.contains('is-expanded')).toBe(false);

    // Confirm and cancel buttons must now be visible
    expect(rowA!.querySelector('.cast-log-delete-confirm')).not.toBeNull();
    expect(rowA!.querySelector('.cast-log-delete-cancel')).not.toBeNull();

    // Idle delete button must no longer be visible (replaced by confirm/cancel)
    expect(rowA!.querySelector('.cast-log-delete-btn')).toBeNull();
  });

  // (c) Confirm → deleteCast called once with that castId, row removed after reload
  it('clicking confirm calls deleteCast once and the row disappears after source reload', async () => {
    const { container, source, refresh, mutator } = mountPanel([recordA, recordB]);
    await flushPromises();

    const rowA = Array.from(container.querySelectorAll('.cast-log-row')).find((r) =>
      r.textContent?.includes('Fireball')
    ) as HTMLElement | undefined;
    expect(rowA).toBeTruthy();

    // Enter confirming state
    const deleteBtn = rowA!.querySelector('.cast-log-delete-btn') as HTMLElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();

    // Click the confirm button
    const confirmBtn = rowA!.querySelector('.cast-log-delete-confirm') as HTMLElement | null;
    expect(confirmBtn).not.toBeNull();
    confirmBtn!.click();

    await flushPromises();

    // deleteCast must have been called exactly once with cast-a
    expect(mutator.deleteCast).toHaveBeenCalledTimes(1);
    expect(mutator.deleteCast).toHaveBeenCalledWith('cast-a');

    // After deletion + source reload, record-a is gone; panel re-renders without it
    source.records = [recordB];
    refresh.fire();
    await flushPromises();

    const rowsAfter = container.querySelectorAll('.cast-log-row');
    const rowAGone = Array.from(rowsAfter).find((r) => r.textContent?.includes('Fireball'));
    expect(rowAGone).toBeUndefined();
  });

  // (d) Cancel → no mutator call, control back to idle
  it('clicking cancel makes no mutator call and restores the idle delete button', async () => {
    const { container, mutator } = mountPanel([recordA, recordB]);
    await flushPromises();

    const rowA = Array.from(container.querySelectorAll('.cast-log-row')).find((r) =>
      r.textContent?.includes('Fireball')
    ) as HTMLElement | undefined;
    expect(rowA).toBeTruthy();

    // Enter confirming state
    const deleteBtn = rowA!.querySelector('.cast-log-delete-btn') as HTMLElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();

    // Cancel
    const cancelBtn = rowA!.querySelector('.cast-log-delete-cancel') as HTMLElement | null;
    expect(cancelBtn).not.toBeNull();
    cancelBtn!.click();

    // No mutator call
    expect(mutator.deleteCast).not.toHaveBeenCalled();

    // Idle delete button must be back; confirm/cancel must be gone
    expect(rowA!.querySelector('.cast-log-delete-btn')).not.toBeNull();
    expect(rowA!.querySelector('.cast-log-delete-confirm')).toBeNull();
    expect(rowA!.querySelector('.cast-log-delete-cancel')).toBeNull();
  });

  // (e) Mid-confirm refresh.fire() preserves confirm state (panel-keyed pendingConfirmIds)
  it('a refresh while confirming preserves the confirming state for that row', async () => {
    const { container, refresh } = mountPanel([recordA, recordB]);
    await flushPromises();

    const rowA = Array.from(container.querySelectorAll('.cast-log-row')).find((r) =>
      r.textContent?.includes('Fireball')
    ) as HTMLElement | undefined;
    expect(rowA).toBeTruthy();

    // Enter confirming state
    const deleteBtn = rowA!.querySelector('.cast-log-delete-btn') as HTMLElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();

    // Verify confirming before refresh
    expect(rowA!.querySelector('.cast-log-delete-confirm')).not.toBeNull();

    // Trigger a refresh cycle — panel re-renders from source
    refresh.fire();
    await flushPromises();

    // After refresh, the row for cast-a must still be in confirming state
    const rowAAfter = Array.from(container.querySelectorAll('.cast-log-row')).find((r) =>
      r.textContent?.includes('Fireball')
    ) as HTMLElement | undefined;
    expect(rowAAfter).toBeTruthy();
    expect(rowAAfter!.querySelector('.cast-log-delete-confirm')).not.toBeNull();
    expect(rowAAfter!.querySelector('.cast-log-delete-cancel')).not.toBeNull();
    expect(rowAAfter!.querySelector('.cast-log-delete-btn')).toBeNull();
  });

  // (f) Delete control appears exactly once per row — not duplicated in the body
  it('delete button appears exactly once per row even when expanded', async () => {
    const { container } = mountPanel([recordA, recordB]);
    await flushPromises();

    const rowA = Array.from(container.querySelectorAll('.cast-log-row')).find((r) =>
      r.textContent?.includes('Fireball')
    ) as HTMLElement | undefined;
    expect(rowA).toBeTruthy();

    // Expand the row
    const header = rowA!.querySelector('.cast-log-row-header') as HTMLElement;
    header.click();
    expect(rowA!.classList.contains('is-expanded')).toBe(true);

    // There should be exactly one delete button in the entire row
    const deleteBtns = rowA!.querySelectorAll('.cast-log-delete-btn');
    expect(deleteBtns.length).toBe(1);

    // The single delete button must live inside the header, not the body
    const body = rowA!.querySelector('.cast-log-row-body');
    expect(body).not.toBeNull();
    expect(body!.querySelector('.cast-log-delete-btn')).toBeNull();
  });
});
