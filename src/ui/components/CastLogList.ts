import type { CastRecord } from '../../castLog/CastRecord';
import { CastLogRow } from './CastLogRow';

export class CastLogList {
  #header: HTMLElement;
  #listWrapper: HTMLElement;
  #rows: CastLogRow[] = [];
  #rowsById: Map<string, CastLogRow> = new Map();
  #isEmptyView = false;
  readonly #openLink: (path: string) => void;

  constructor(container: HTMLElement, openLink: (path: string) => void) {
    this.#openLink = openLink;
    // Header for in-flight count (hidden by default)
    this.#header = container.createDiv({ cls: 'cast-log-header is-hidden' });

    // List wrapper for rows
    this.#listWrapper = container.createDiv({ cls: 'cast-log-list' });
  }

  render(
    records: CastRecord[],
    expandedIds: Set<string>,
    now: Date,
    onToggle: (castId: string) => void
  ): void {
    if (records.length === 0) {
      this.#showEmptyState();
      return;
    }
    this.#isEmptyView = false;
    this.#updateHeader(records);
    this.#removeStaleRows(new Set(records.map((r) => r.castId)));
    this.#syncRows(records, expandedIds, now, onToggle);
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
    this.#header.addClass('is-hidden');
  }

  #updateHeader(records: CastRecord[]): void {
    const inFlightCount = records.filter(
      (r) => r.status === 'casted' || r.status === 'in-progress'
    ).length;
    if (inFlightCount > 0) {
      this.#header.textContent = `${inFlightCount} in flight`;
      this.#header.removeClass('is-hidden');
    } else {
      this.#header.addClass('is-hidden');
    }
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
    onToggle: (castId: string) => void
  ): void {
    this.#listWrapper.empty();
    this.#rows = [];
    for (const record of records) {
      let row = this.#rowsById.get(record.castId);
      if (!row) {
        row = new CastLogRow(this.#listWrapper, record, this.#openLink);
        row.render(expandedIds.has(record.castId), now, () => onToggle(record.castId));
        this.#rowsById.set(record.castId, row);
      } else {
        row.update(record, expandedIds.has(record.castId), now);
        this.#listWrapper.appendChild(row.el);
      }
      this.#rows.push(row);
    }
  }
}
