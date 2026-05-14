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
    // Handle empty records case
    if (records.length === 0) {
      if (!this.#isEmptyView) {
        this.#listWrapper.empty();
        this.#listWrapper.createSpan({
          cls: 'text-muted',
          text: 'No casts yet',
        });
        this.#isEmptyView = true;
        this.#rows = [];
        this.#rowsById.clear();
      }
      this.#header.addClass('is-hidden');
      return;
    }

    this.#isEmptyView = false;

    // Count in-flight records (status is 'casted' or 'in-progress')
    const inFlightCount = records.filter(
      (r) => r.status === 'casted' || r.status === 'in-progress'
    ).length;

    // Show or hide header based on in-flight count
    if (inFlightCount > 0) {
      this.#header.textContent = `${inFlightCount} in flight`;
      this.#header.removeClass('is-hidden');
    } else {
      this.#header.addClass('is-hidden');
    }

    // Track which castIds should exist
    const recordIds = new Set(records.map((r) => r.castId));

    // Remove rows for records that are no longer present
    const castIdsToRemove: string[] = [];
    for (const castId of this.#rowsById.keys()) {
      if (!recordIds.has(castId)) {
        castIdsToRemove.push(castId);
      }
    }
    for (const castId of castIdsToRemove) {
      const row = this.#rowsById.get(castId);
      if (row) {
        row.el.remove();
        this.#rowsById.delete(castId);
      }
    }

    // Clear and rebuild rows list in correct order, reusing or creating rows
    this.#listWrapper.empty();
    this.#rows = [];

    for (const record of records) {
      let row = this.#rowsById.get(record.castId);

      if (!row) {
        // Create new row
        row = new CastLogRow(
          this.#listWrapper,
          record,
          expandedIds.has(record.castId),
          now,
          () => onToggle(record.castId),
          this.#openLink
        );
        this.#rowsById.set(record.castId, row);
      } else {
        // Row exists — update record, header, badge, body, and expanded state
        row.update(record, expandedIds.has(record.castId), now);
        this.#listWrapper.appendChild(row.el);
      }

      this.#rows.push(row);
    }
  }

  repaintTimes(now: Date): void {
    for (const row of this.#rows) {
      row.repaintTimes(now);
    }
  }

  getRowCastIds(): string[] {
    return this.#rows.map((r) => r.castId);
  }
}
