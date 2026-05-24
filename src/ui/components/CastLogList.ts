import type { CastRecord } from '../../castLog/CastRecord';
import { CastLogRow, type RowDeleteControl } from './CastLogRow';
import { SystemSpellRegistry } from '../../castLog/SystemSpellRegistry';

/**
 * Renders a list of cast records with per-row expansion state and time-display updates.
 * Maintains a cache of row instances keyed by castId for efficient partial redraws.
 */
export class CastLogList {
  #header: HTMLElement;
  #clearAllContainer: HTMLElement;
  #listWrapper: HTMLElement;
  #rows: CastLogRow[] = [];
  #rowsById: Map<string, CastLogRow> = new Map();
  #isEmptyView = false;
  #headerAbortController: AbortController = new AbortController();
  readonly #openLink: (path: string) => void;
  readonly #vaultRootAbs: string;
  readonly #registry: SystemSpellRegistry;

  constructor(
    container: HTMLElement,
    openLink: (path: string) => void,
    vaultRootAbs = '',
    registry = new SystemSpellRegistry(),
  ) {
    this.#openLink = openLink;
    this.#vaultRootAbs = vaultRootAbs;
    this.#registry = registry;
    this.#header = container.createDiv({ cls: 'cast-log-header is-hidden' });
    this.#clearAllContainer = this.#header.createDiv({ cls: 'cast-log-clear-all-container' });
    this.#listWrapper = container.createDiv({ cls: 'cast-log-list' });
  }

  render(
    records: CastRecord[],
    expandedIds: Set<string>,
    now: Date,
    onToggle: (castId: string) => void,
    pendingConfirmIds: Set<string>,
    onDeleteCast: (castId: string) => void,
    onRequestConfirm: (castId: string) => void,
    onCancelConfirm: (castId: string) => void,
    onClearAll: () => void
  ): void {
    if (records.length === 0) {
      this.#showEmptyState();
      return;
    }
    this.#isEmptyView = false;
    this.#updateHeader(records, onClearAll);
    this.#removeStaleRows(new Set(records.map((r) => r.castId)));
    this.#syncRows(records, expandedIds, now, onToggle, pendingConfirmIds, onDeleteCast, onRequestConfirm, onCancelConfirm);
  }

  repaintTimes(now: Date): void {
    for (const row of this.#rows) {
      row.repaintTimes(now);
    }
  }

  #showEmptyState(): void {
    if (!this.#isEmptyView) {
      this.#listWrapper.empty();
      this.#listWrapper.createSpan({ cls: 'text-muted', text: 'No casts yet' });
      this.#isEmptyView = true;
      this.#rows = [];
      this.#rowsById.clear();
    }
    this.#clearAllContainer.empty();
    this.#header.addClass('is-hidden');
  }

  #updateHeader(records: CastRecord[], onClearAll: () => void): void {
    // Abort previous listeners and create a new controller for the clear-all button
    this.#headerAbortController.abort();
    this.#headerAbortController = new AbortController();

    const inFlightCount = records.filter(
      (r) => r.status === 'casted' || r.status === 'in-progress'
    ).length;

    // Always show header when records exist; render in-flight count text and clear-all button
    this.#header.removeClass('is-hidden');

    // Clear the header content and rebuild
    this.#header.empty();

    // Render in-flight count text if needed (left side)
    if (inFlightCount > 0) {
      this.#header.createSpan({ text: `${inFlightCount} in flight` });
    }

    // Recreate the clear-all container (right side via margin-left: auto)
    this.#clearAllContainer = this.#header.createDiv({ cls: 'cast-log-clear-all-container' });

    // Render the clear-all button
    this.#renderClearAllControl(this.#clearAllContainer, onClearAll, this.#headerAbortController.signal);
  }

  #renderClearAllControl(host: HTMLElement, onClearAll: () => void, signal: AbortSignal): void {
    const btn = host.createEl('button', { cls: 'cast-log-clear-all-btn', text: 'Clear all' });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClearAll();
    }, { signal });
  }

  #removeStaleRows(recordIds: Set<string>): void {
    const castIdsToRemove: string[] = [];
    for (const castId of this.#rowsById.keys()) {
      if (!recordIds.has(castId)) castIdsToRemove.push(castId);
    }
    for (const castId of castIdsToRemove) {
      this.#rowsById.get(castId)?.el.remove();
      this.#rowsById.delete(castId);
    }
  }

  #syncRows(
    records: CastRecord[],
    expandedIds: Set<string>,
    now: Date,
    onToggle: (castId: string) => void,
    pendingConfirmIds: Set<string>,
    onDeleteCast: (castId: string) => void,
    onRequestConfirm: (castId: string) => void,
    onCancelConfirm: (castId: string) => void
  ): void {
    this.#rows = [];
    for (const record of records) {
      const deleteControl: RowDeleteControl = {
        pendingConfirm: pendingConfirmIds.has(record.castId),
        onRequestDelete: () => onRequestConfirm(record.castId),
        onConfirmDelete: () => onDeleteCast(record.castId),
        onCancelDelete: () => onCancelConfirm(record.castId),
      };
      let row = this.#rowsById.get(record.castId);
      if (!row) {
        row = new CastLogRow(this.#listWrapper, record, this.#openLink, this.#vaultRootAbs, this.#registry);
        row.render(expandedIds.has(record.castId), now, () => onToggle(record.castId), deleteControl);
        this.#rowsById.set(record.castId, row);
      } else {
        row.update(record, expandedIds.has(record.castId), now, deleteControl);
      }
      // Re-append in iteration order so existing rows stay correctly ordered
      // without destroying the DOM (which would reset scroll position).
      this.#listWrapper.appendChild(row.el);
      this.#rows.push(row);
    }
  }
}
