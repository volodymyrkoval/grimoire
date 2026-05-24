import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { CastRecord } from '../../castLog/CastRecord';
import type { CastLogSource } from '../../castLog/CastLogSource';
import type { RefreshCoordinator } from '../../castLog/RefreshCoordinator';
import type { TickCoordinator } from '../../castLog/TickCoordinator';
import { CastLogList } from '../components/CastLogList';
import { ClearAllConfirmModal } from '../components/ClearAllConfirmModal';
import { SystemSpellRegistry } from '../../castLog/SystemSpellRegistry';
import type { TabPanel } from './TabPanel';
import type { CastLogMutator } from '../../castLog/CastLogMutator';

/**
 * Dependencies for CastLogPanel.
 * The panel orchestrates source (data loading), refresh (vault-modify events),
 * and tick (1s interval) coordinators, plus the openLink callback and now() clock.
 * vaultRootAbs is forwarded to each row for legacy absolute-path normalisation.
 */
export interface CastLogPanelDeps {
  source: CastLogSource;
  refresh: RefreshCoordinator;
  tick: TickCoordinator;
  openLink: (vaultPath: string) => void;
  now: () => Date;
  vaultRootAbs?: string;
  /** Registry of system spells for display-name resolution. Defaults to empty when omitted. */
  registry?: SystemSpellRegistry;
  /** Mutation operations: delete cast(s) from log. */
  mutator: CastLogMutator;
  /** Obsidian App instance — required to open the clear-all confirmation modal. */
  app: App;
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
  #pendingConfirmIds = new Set<string>();
  #disposed = false;
  readonly #deps: CastLogPanelDeps;

  constructor(deps: CastLogPanelDeps) {
    this.#deps = deps;
  }

  mount(container: HTMLElement): void {
    this.#disposed = false;
    this.#initList(container);
    this.#reload();
    this.#startRefresh();
    this.#startTick();
  }

  unmount(): void {
    this.#disposed = true;
    this.#deps.refresh.stop();
    this.#deps.tick.stop();
  }

  #initList(container: HTMLElement): void {
    this.#list = new CastLogList(
      container,
      this.#deps.openLink,
      this.#deps.vaultRootAbs ?? '',
      this.#deps.registry,
    );
  }

  #startRefresh(): void {
    this.#deps.refresh.start(() => this.#reload());
  }

  #startTick(): void {
    this.#deps.tick.start(() => {
      if (!this.#disposed) {
        this.#list?.repaintTimes(this.#deps.now());
      }
    });
  }

  #reload(): void {
    void this.#deps.source.load().then((records) => {
      if (this.#disposed) return;
      this.#records = records;
      this.#renderList();
    });
  }

  #renderList(): void {
    this.#list?.render(
      this.#records,
      this.#expandedIds,
      this.#deps.now(),
      (castId) => this.#handleToggle(castId),
      this.#pendingConfirmIds,
      (castId) => { void this.#handleDeleteCast(castId); },
      (castId) => this.#handleRequestConfirm(castId),
      (castId) => this.#handleCancelConfirm(castId),
      () => this.#handleClearAll(),
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

  #handleRequestConfirm(castId: string): void {
    this.#pendingConfirmIds.add(castId);
    this.#renderList();
  }

  #handleCancelConfirm(castId: string): void {
    this.#pendingConfirmIds.delete(castId);
    this.#renderList();
  }

  async #handleDeleteCast(castId: string): Promise<void> {
    try {
      await this.#deps.mutator.deleteCast(castId);
    } catch (e) {
      new Notice('Could not delete cast — see console');
      console.error('deleteCast failed', e);
    } finally {
      this.#pendingConfirmIds.delete(castId);
    }
    this.#reload();
  }

  /**
   * Opens the clear-all confirmation modal.
   * On confirm: calls mutator.clearAll(), optimistically clears the displayed list,
   * then schedules a reload (macrotask) so the source reflects the deletion before re-render.
   */
  #handleClearAll(): void {
    const onConfirm = () => {
      void (async () => {
        try {
          await this.#deps.mutator.clearAll();
        } catch (e) {
          new Notice('Could not clear cast log — see console');
          console.error('clearAll failed', e);
          return;
        }
        this.#records = [];
        this.#renderList();
        // Schedule reload as a macrotask so upstream source state settles first.
        activeWindow.setTimeout(() => { this.#reload(); }, 0);
      })();
    };
    new ClearAllConfirmModal(this.#deps.app, this.#records.length, onConfirm).open();
  }
}
