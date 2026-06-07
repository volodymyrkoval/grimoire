/**
 * Integration test: CastLogPanel — clear-all confirmation flow.
 *
 * Seam: CastLogPanel (parent) → CastLogList header control → real ClearAllConfirmModal
 * → FakeCastLogMutator injected through CastLogPanelDeps.
 *
 * Real children: CastLogList, ClearAllConfirmModal. Fake injected deps only (no vi.mock of children).
 *
 * Expected class names (must match F2/F3 implementation):
 *   .cast-log-clear-all-btn     — header clear-all trigger (E1)
 *   .cast-log-modal-remove-btn  — Remove button in modal (F2)
 *   .cast-log-modal-cancel-btn  — Cancel button in modal (F2)
 *
 * RED criterion (F0):
 *   Tests (b), (c), (d) are the load-bearing red assertions — they fail because
 *   CastLogPanel.#handleClearAll() is not yet wired (F3) and ClearAllConfirmModal
 *   body is a stub (F2). Tests (a) and (e) verify prior-section behaviour.
 *
 * Green when F2 + F3 land.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CastRecord } from '../../src/castLog/CastRecord';
import { CastLogPanel } from '../../src/ui/tabs/CastLogPanel';
import { ClearAllConfirmModal } from '../../src/ui/components/ClearAllConfirmModal';
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
  model: 'opus',
  effort: null,
  contextNotes: [],
  castedTs: new Date(NOW_MS - 60_000).toISOString(),
};

const recordB: CastRecord = {
  castId: 'cast-b',
  status: 'done',
  spellPath: '<forge>',
  model: 'sonnet',
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
  mutator: FakeCastLogMutator;
  panel: CastLogPanel;
}

function mountPanel(records: CastRecord[]): MountResult {
  const container = document.createElement('div');
  const source = new FakeCastLogSource(records);
  const refresh = new FakeRefreshCoordinator();
  const tick = new FakeTickCoordinator();
  const mutator = new FakeCastLogMutator();
  const app = new App();

  // Cast to any to tolerate F3 adding `app` to CastLogPanelDeps — the field is
  // provided here so tests remain valid once F3 lands without modification.
  const panel = new CastLogPanel({
    source,
    refresh,
    tick,
    openLink: vi.fn(),
    now: () => new Date(),
    mutator,
    app,
  } as any);

  panel.mount(container);
  return { container, source, refresh, mutator, panel };
}

// ---------------------------------------------------------------------------
// F0 — Clear-all confirmation flow
// ---------------------------------------------------------------------------

describe('CastLogPanel — clear-all confirmation', () => {
  beforeEach(() => {
    // Restore any spies so each test starts clean
    vi.restoreAllMocks();
  });

  // (a) Clear-all control present when records exist
  it('renders a clear-all button in the header when records exist', async () => {
    const { container } = mountPanel([recordA, recordB]);
    await flushPromises();

    const btn = container.querySelector('.cast-log-clear-all-btn');
    expect(btn).not.toBeNull();
  });

  // (b) Clicking the button opens a modal whose text includes the count
  // RED until F3 wires #handleClearAll() and F2 renders the count heading.
  it('clicking the clear-all button opens a modal containing the record count', async () => {
    const openSpy = vi.spyOn(ClearAllConfirmModal.prototype, 'open');

    const { container } = mountPanel([recordA, recordB]);
    await flushPromises();

    const btn = container.querySelector('.cast-log-clear-all-btn') as HTMLElement | null;
    expect(btn).not.toBeNull();
    btn!.click();

    // open() must have been called exactly once (F3: #handleClearAll instantiates + opens the modal)
    expect(openSpy).toHaveBeenCalledTimes(1);

    // After open(), onOpen() calls #renderMessage() which (after F2) renders
    // "Remove all 2 casts?" in contentEl. The text must contain the count.
    const modal = openSpy.mock.instances[0] as ClearAllConfirmModal;
    expect(modal.contentEl.textContent).toContain('2');
  });

  // (c) Clicking Remove → clearAll() called once → panel shows "No casts yet" after reload
  // RED until F2 renders the Remove button and F3 wires #handleClearAll().
  it('clicking the Remove button calls clearAll once and the panel resets to empty state', async () => {
    vi.spyOn(ClearAllConfirmModal.prototype, 'open');

    const { container, source, mutator } = mountPanel([recordA, recordB]);
    await flushPromises();

    // Click the header clear-all trigger
    const clearBtn = container.querySelector('.cast-log-clear-all-btn') as HTMLElement | null;
    expect(clearBtn).not.toBeNull();
    clearBtn!.click();

    // Find the Remove button inside the modal's contentEl
    // The modal was appended to document.body by Modal.open() in the mock.
    const removeBtn = document.body.querySelector('.cast-log-modal-remove-btn') as HTMLElement | null;
    expect(removeBtn).not.toBeNull(); // RED until F2 renders this button

    removeBtn!.click();
    await flushPromises();

    // clearAll must have been called exactly once
    expect(mutator.clearAll).toHaveBeenCalledTimes(1);

    // After clearAll + #reload(), source returns empty — panel shows "No casts yet"
    source.records = [];
    // The #reload() inside onConfirm already fired; a refresh.fire() is not needed
    // because F3's onConfirm calls #reload() directly. Flush the resulting promise.
    await flushPromises();

    expect(container.textContent).toContain('No casts yet');
  });

  // (d) Cancel → clearAll() zero calls, rows intact
  // RED until F2 renders the Cancel button and F3 wires #handleClearAll().
  it('clicking the Cancel button makes no clearAll call and leaves rows intact', async () => {
    vi.spyOn(ClearAllConfirmModal.prototype, 'open');

    const { container, mutator } = mountPanel([recordA, recordB]);
    await flushPromises();

    // Click the header clear-all trigger
    const clearBtn = container.querySelector('.cast-log-clear-all-btn') as HTMLElement | null;
    expect(clearBtn).not.toBeNull();
    clearBtn!.click();

    // Find the Cancel button inside the modal's contentEl
    const cancelBtn = document.body.querySelector('.cast-log-modal-cancel-btn') as HTMLElement | null;
    expect(cancelBtn).not.toBeNull(); // RED until F2 renders this button

    cancelBtn!.click();
    await flushPromises();

    // clearAll must NOT have been called
    expect(mutator.clearAll).not.toHaveBeenCalled();

    // Original rows must still be present
    const rows = container.querySelectorAll('.cast-log-row');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  // (e) Clear-all control absent in the initial empty state
  it('does not render the clear-all button when the panel is empty', async () => {
    const { container } = mountPanel([]);
    await flushPromises();

    const btn = container.querySelector('.cast-log-clear-all-btn');
    expect(btn).toBeNull();
  });
});
