/**
 * Integration test: CastLogPanel — component-seam tests.
 *
 * Seam: the boundary between CastLogPanel (parent) and its real children —
 * CastLogList, CastLogRow — via the injected deps surface:
 *   FakeCastLogSource, FakeRefreshCoordinator, FakeTickCoordinator, openLink vi.fn().
 *
 * RED until CastLogPanel is implemented at src/ui/tabs/CastLogPanel.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CastRecord } from '../../src/castLog/CastRecord';
// CastLogPanel does not exist yet — this import causes the module-not-found red.
import { CastLogPanel } from '../../src/ui/tabs/CastLogPanel';

// ---------------------------------------------------------------------------
// Fake seam implementations — never real coordinators, never vi.mock of children
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

// ---------------------------------------------------------------------------
// Test records
// ---------------------------------------------------------------------------

const NOW_MS = Date.now();

/** Record A — in-flight live spell */
const recordA: CastRecord = {
  castId: 'cast-a',
  status: 'in-progress',
  spellPath: 'Spells/Fireball.md',
  model: 'claude-opus-4-7',
  effort: null,
  contextNotes: ['Notes/context.md'],
  castedTs: new Date(NOW_MS - 60_000).toISOString(),
};

/** Record B — completed forge cast */
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
  openLink: ReturnType<typeof vi.fn>;
  panel: CastLogPanel;
}

function mountPanel(records: CastRecord[], now?: () => Date): MountResult {
  const container = document.createElement('div');
  const source = new FakeCastLogSource(records);
  const refresh = new FakeRefreshCoordinator();
  const tick = new FakeTickCoordinator();
  const openLink = vi.fn();
  const nowFn = now ?? (() => new Date());

  const panel = new CastLogPanel({ source, refresh, tick, openLink, now: nowFn });
  panel.mount(container);

  return { container, source, refresh, tick, openLink, panel };
}

// ---------------------------------------------------------------------------
// D0 — Main panel mount assertions
// ---------------------------------------------------------------------------

describe('CastLogPanel', () => {
  describe('D0 — mount rendering', () => {
    it('renders in-flight count header when records present', async () => {
      const { container, tick } = mountPanel([recordA, recordB]);
      await flushPromises();

      const headerText = container.textContent;
      expect(headerText).toContain('1 in flight');

      expect(container.textContent).toContain('Fireball');
      expect(container.textContent).toContain('Forge: result');

      expect(container.textContent).toContain('Running');
      expect(container.textContent).toContain('Done');

      const rowA = container.querySelector('[data-cast-id="cast-a"], .cast-log-row') as HTMLElement;
      const durationSpan = rowA?.querySelector('.cast-log-duration') as HTMLElement | null;
      const durationBefore = durationSpan?.textContent ?? '';

      const laterNow = new Date(NOW_MS + 2_000);

      const container2 = document.createElement('div');
      let currentTime = new Date(NOW_MS);
      const source2 = new FakeCastLogSource([recordA, recordB]);
      const refresh2 = new FakeRefreshCoordinator();
      const tick2 = new FakeTickCoordinator();
      const panel2 = new CastLogPanel({
        source: source2,
        refresh: refresh2,
        tick: tick2,
        openLink: vi.fn(),
        now: () => currentTime,
      });
      panel2.mount(container2);
      await flushPromises();

      const durationSpan2 = container2.querySelector('.cast-log-duration') as HTMLElement | null;
      const durationBeforeTick = durationSpan2?.textContent ?? '';

      currentTime = new Date(NOW_MS + 5_000);
      tick2.fire();

      const durationAfterTick = durationSpan2?.textContent ?? '';
      expect(durationAfterTick).not.toBe(durationBeforeTick);
    });

    it('renders "No casts yet" when records empty', async () => {
      const { container } = mountPanel([]);
      await flushPromises();

      expect(container.textContent).toContain('No casts yet');
      expect(container.textContent).not.toContain('in flight');
    });

    it('clicking row header toggles is-expanded and shows body with castId', async () => {
      const { container } = mountPanel([recordA, recordB]);
      await flushPromises();

      const rows = container.querySelectorAll('.cast-log-row');
      expect(rows.length).toBeGreaterThanOrEqual(1);

      const rowA = Array.from(rows).find((r) =>
        r.textContent?.includes('Fireball')
      ) as HTMLElement | undefined;
      expect(rowA).toBeTruthy();

      const header = rowA!.querySelector('.cast-log-row-header') as HTMLElement;
      expect(header).toBeTruthy();
      header.click();

      expect(rowA!.classList.contains('is-expanded')).toBe(true);

      const body = rowA!.querySelector('.cast-log-row-body') as HTMLElement | null;
      expect(body).toBeTruthy();
      expect(body!.textContent).toContain('cast-a');

      const links = Array.from(body!.querySelectorAll('a'));
      const contextLink = links.find((a) => a.textContent?.includes('context'));
      expect(contextLink).toBeTruthy();
    });

    it('clicking row again collapses it', async () => {
      const { container } = mountPanel([recordA, recordB]);
      await flushPromises();

      const rows = container.querySelectorAll('.cast-log-row');
      const rowA = Array.from(rows).find((r) =>
        r.textContent?.includes('Fireball')
      ) as HTMLElement | undefined;
      expect(rowA).toBeTruthy();

      const header = rowA!.querySelector('.cast-log-row-header') as HTMLElement;

      header.click();
      expect(rowA!.classList.contains('is-expanded')).toBe(true);

      header.click();
      expect(rowA!.classList.contains('is-expanded')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // D1 — Link click
  // -------------------------------------------------------------------------

  describe('D1 — link click calls openLink', () => {
    it('clicking a context-note link calls openLink exactly once with that path', async () => {
      const { container, openLink } = mountPanel([recordA, recordB]);
      await flushPromises();

      // Expand recordA
      const rows = container.querySelectorAll('.cast-log-row');
      const rowA = Array.from(rows).find((r) =>
        r.textContent?.includes('Fireball')
      ) as HTMLElement | undefined;
      expect(rowA).toBeTruthy();

      const header = rowA!.querySelector('.cast-log-row-header') as HTMLElement;
      header.click();

      // Click the context-note link for 'Notes/context.md'
      const body = rowA!.querySelector('.cast-log-row-body') as HTMLElement;
      const links = Array.from(body.querySelectorAll('a'));
      const contextLink = links.find((a) => a.textContent?.includes('context')) as
        | HTMLAnchorElement
        | undefined;
      expect(contextLink).toBeTruthy();

      contextLink!.click();

      expect(openLink).toHaveBeenCalledTimes(1);
      expect(openLink).toHaveBeenCalledWith('Notes/context.md');
    });
  });

  // -------------------------------------------------------------------------
  // D3 — Unmount then re-mount renders rows again
  // -------------------------------------------------------------------------

  describe('D3 — unmount / re-mount lifecycle', () => {
    it('When CastLogPanel is unmounted then re-mounted, then rows are still rendered', async () => {
      const container = document.createElement('div');
      const source = new FakeCastLogSource([recordA, recordB]);
      const refresh = new FakeRefreshCoordinator();
      const tick = new FakeTickCoordinator();
      const panel = new CastLogPanel({ source, refresh, tick, openLink: vi.fn(), now: () => new Date() });

      panel.mount(container);
      await flushPromises();

      const rowsFirstMount = container.querySelectorAll('.cast-log-row');
      expect(rowsFirstMount.length).toBeGreaterThan(0);

      panel.unmount();

      // In production (SearchInput / reattachTabBar) the container is cleared
      // before panel.mount() is called again. Replicate that here so stale DOM
      // from the first mount does not mask the bug.
      container.innerHTML = '';

      panel.mount(container);
      await flushPromises();

      const rowsSecondMount = container.querySelectorAll('.cast-log-row');
      expect(rowsSecondMount.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // D4 — Stale row badge/body after record update across refresh
  // -------------------------------------------------------------------------

  describe('D4 — row updates after record change across refresh', () => {
    it('When a cast transitions from in-progress to done across a refresh, then the row badge and body update', async () => {
      const inProgressRecord: CastRecord = {
        castId: 'cast-transition',
        status: 'in-progress',
        spellPath: 'Spells/Transmutation.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        castedTs: new Date(NOW_MS - 30_000).toISOString(),
      };

      const source = new FakeCastLogSource([inProgressRecord]);
      const refresh = new FakeRefreshCoordinator();
      const tick = new FakeTickCoordinator();
      const container = document.createElement('div');

      const panel = new CastLogPanel({ source, refresh, tick, openLink: vi.fn(), now: () => new Date() });
      panel.mount(container);
      await flushPromises();

      const badgeBefore = container.querySelector('.cast-log-status-badge') as HTMLElement | null;
      expect(badgeBefore).toBeTruthy();
      expect(badgeBefore!.textContent).toBe('Running');

      const doneRecord: CastRecord = {
        ...inProgressRecord,
        status: 'done',
        endedTs: new Date(NOW_MS).toISOString(),
        affectedFiles: ['Notes/transmuted.md'],
      };
      source.records = [doneRecord];

      refresh.fire();
      await flushPromises();

      const badgeAfter = container.querySelector('.cast-log-status-badge') as HTMLElement | null;
      expect(badgeAfter).toBeTruthy();
      expect(badgeAfter!.textContent).toBe('Done');

      const affectedLinks = container.querySelectorAll('.cast-log-affected-files a');
      expect(affectedLinks.length).toBeGreaterThan(0);
      expect(affectedLinks[0].textContent).toBe('Notes/transmuted.md');
    });
  });

  // -------------------------------------------------------------------------
  // D2 — Expansion survives refresh
  // -------------------------------------------------------------------------

  describe('D2 — expansion survives refresh', () => {
    it('expanded row stays expanded after reload; other rows remain collapsed', async () => {
      const source = new FakeCastLogSource([recordA, recordB]);
      const refresh = new FakeRefreshCoordinator();
      const tick = new FakeTickCoordinator();
      const openLink = vi.fn();
      const container = document.createElement('div');

      const panel = new CastLogPanel({ source, refresh, tick, openLink, now: () => new Date() });
      panel.mount(container);
      await flushPromises();

      const rowsBefore = container.querySelectorAll('.cast-log-row');
      const rowA = Array.from(rowsBefore).find((r) =>
        r.textContent?.includes('Fireball')
      ) as HTMLElement | undefined;
      expect(rowA).toBeTruthy();

      rowA!.querySelector('.cast-log-row-header')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(rowA!.classList.contains('is-expanded')).toBe(true);

      refresh.fire();
      await flushPromises();

      const rowsAfter = container.querySelectorAll('.cast-log-row');

      const rowAAfter = Array.from(rowsAfter).find((r) =>
        r.textContent?.includes('Fireball')
      ) as HTMLElement | undefined;
      const rowBAfter = Array.from(rowsAfter).find((r) =>
        r.textContent?.includes('Forge')
      ) as HTMLElement | undefined;

      expect(rowAAfter).toBeTruthy();
      expect(rowBAfter).toBeTruthy();

      expect(rowAAfter!.classList.contains('is-expanded')).toBe(true);
      expect(rowBAfter!.classList.contains('is-expanded')).toBe(false);
    });
  });
});
