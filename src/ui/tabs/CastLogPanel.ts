import type { CastRecord } from '../../castLog/CastRecord';
import type { CastLogSource } from '../../castLog/CastLogSource';
import type { RefreshCoordinator } from '../../castLog/RefreshCoordinator';
import type { TickCoordinator } from '../../castLog/TickCoordinator';
import { CastLogList } from '../components/CastLogList';
import type { TabPanel } from './TabPanel';

/**
 * Dependencies for CastLogPanel.
 * The panel orchestrates source (data loading), refresh (vault-modify events),
 * and tick (1s interval) coordinators, plus the openLink callback and now() clock.
 */
export interface CastLogPanelDeps {
  source: CastLogSource;
  refresh: RefreshCoordinator;
  tick: TickCoordinator;
  openLink: (vaultPath: string) => void;
  now: () => Date;
}

/**
 * CastLogPanel — implements TabPanel for the Logs tab of CommandPopup.
 *
 * Keyboard navigation is intentionally absent per the pitch scope.
 * The panel owns expansion state (Set<string> of expanded castIds).
 * On mount, it loads records, starts refresh + tick coordinators.
 * On unmount, it tears down coordinators and clears state.
 * Re-renders preserve the expanded set across refreshes.
 */
export class CastLogPanel implements TabPanel {
  readonly id = 'logs';

  #list?: CastLogList;
  #records: CastRecord[] = [];
  #expandedIds = new Set<string>();
  #disposed = false;
  // eslint-disable-next-line no-restricted-syntax -- accessed via bracket notation in tests
  private deps: CastLogPanelDeps;

  constructor(deps: CastLogPanelDeps) {
    this.deps = deps;
  }

  mount(container: HTMLElement): void {
    this.#disposed = false;

    // Create the list component
    this.#list = new CastLogList(container, this.deps.openLink);

    // Load records and render
    void this.deps.source.load().then((records) => {
      if (this.#disposed) return;
      this.#records = records;
      this.#renderList();
    });

    // Start refresh coordinator
    this.deps.refresh.start(() => this.#reload());

    // Start tick coordinator
    this.deps.tick.start(() => {
      if (!this.#disposed) {
        this.#list?.repaintTimes(this.deps.now());
      }
    });
  }

  #renderList(): void {
    this.#list?.render(this.#records, this.#expandedIds, this.deps.now(), (castId) =>
      this.#handleToggle(castId)
    );
  }

  #handleToggle(castId: string): void {
    if (this.#expandedIds.has(castId)) {
      this.#expandedIds.delete(castId);
    } else {
      this.#expandedIds.add(castId);
    }
    this.#renderList();
  }

  #reload(): void {
    void this.deps.source.load().then((records) => {
      if (this.#disposed) return;
      this.#records = records;
      this.#renderList();
    });
  }

  unmount(): void {
    this.#disposed = true;
    this.deps.refresh.stop();
    this.deps.tick.stop();
  }

  // TabPanel interface methods (mostly no-ops per pitch)

  filter(_query: string): number {
    return 0;
  }

  confirm(_index: number): void {
    // No-op: keyboard navigation not supported
  }

  move(_delta: number, current: number): number {
    return current;
  }

  updateSelection(_prev: number, _next: number): void {
    // No-op: keyboard navigation not supported
  }

  reset(): void {
    // No-op: keyboard navigation not supported
  }

  get length(): number {
    return 0;
  }
}
