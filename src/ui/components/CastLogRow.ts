import type { CastRecord } from '../../castLog/CastRecord';
import { FORGE_SPELL_PATH } from '../../castLog/types';
import { formatRelativeTime } from '../../castLog/format/relativeTime';
import { formatDuration } from '../../castLog/format/duration';
import { resolveDisplayName } from '../../castLog/format/displayName';
import { statusBadge } from './statusBadge';
import { durationMs } from '../../castLog/format/durationMs';

export class CastLogRow {
  readonly el: HTMLElement;
  #record: CastRecord;
  #startedSpan: HTMLElement;
  #durationSpan: HTMLElement;
  #statusBadgeSpan: HTMLElement;
  #nameSpan: HTMLElement;
  #modelBadgeSpan: HTMLElement;
  #bodyEl: HTMLElement;
  readonly #onOpenLink: (path: string) => void;

  constructor(
    container: HTMLElement,
    record: CastRecord,
    expanded: boolean,
    now: Date,
    onToggle: () => void,
    onOpenLink: (path: string) => void
  ) {
    this.#record = record;
    this.#onOpenLink = onOpenLink;
    this.el = container.createDiv({ cls: 'cast-log-row' });
    if (expanded) {
      this.el.addClass('is-expanded');
    }

    // Header (clickable)
    const header = this.el.createDiv({ cls: 'cast-log-row-header' });
    header.addEventListener('click', onToggle);

    // Display name
    const displayName = resolveDisplayName(record);
    this.#nameSpan = header.createSpan({ cls: 'cast-log-display-name', text: displayName });
    this.#nameSpan.title = displayName;

    // Model + effort badge
    const modelText = record.effort ? `${record.model} ${record.effort}` : record.model;
    this.#modelBadgeSpan = header.createSpan({ cls: 'cast-log-model-badge', text: modelText });

    // Relative time span (started)
    this.#startedSpan = header.createSpan({
      cls: 'cast-log-started',
      text: formatRelativeTime(new Date(record.castedTs), now),
    });

    // Duration span
    const ms = durationMs(record, now);
    this.#durationSpan = header.createSpan({
      cls: 'cast-log-duration',
      text: formatDuration(ms),
    });

    // Status badge
    const { label, cls } = statusBadge(record.status);
    this.#statusBadgeSpan = header.createSpan({
      cls: `cast-log-status-badge ${cls}`,
      text: label,
    });

    // Body (collapsible)
    this.#bodyEl = this.el.createDiv({ cls: 'cast-log-row-body' });
    this.#renderBody(record);
  }

  get castId(): string {
    return this.#record.castId;
  }

  /** Called by CastLogList when the same castId receives an updated record. */
  update(record: CastRecord, expanded: boolean, now: Date): void {
    this.#record = record;

    // Update header spans
    const displayName = resolveDisplayName(record);
    this.#nameSpan.textContent = displayName;
    this.#nameSpan.title = displayName;

    const modelText = record.effort ? `${record.model} ${record.effort}` : record.model;
    this.#modelBadgeSpan.textContent = modelText;

    this.#startedSpan.textContent = formatRelativeTime(new Date(record.castedTs), now);

    const ms = durationMs(record, now);
    this.#durationSpan.textContent = formatDuration(ms);

    // Re-render status badge
    const { label, cls } = statusBadge(record.status);
    this.#statusBadgeSpan.textContent = label;
    this.#statusBadgeSpan.className = `cast-log-status-badge ${cls}`;

    // Re-render body
    this.#bodyEl.empty();
    this.#renderBody(record);

    // Update expanded state
    if (expanded) {
      this.el.addClass('is-expanded');
    } else {
      this.el.removeClass('is-expanded');
    }
  }

  repaintTimes(now: Date): void {
    // Update relative time span (always — cast time is always relevant)
    this.#startedSpan.textContent = formatRelativeTime(new Date(this.#record.castedTs), now);

    // Update duration only for in-flight rows — completed rows have a fixed duration
    if (!this.#record.endedTs) {
      const ms = durationMs(this.#record, now);
      this.#durationSpan.textContent = formatDuration(ms);
    }
  }

  #renderBody(record: CastRecord): void {
    const body = this.#bodyEl;

    // Cast ID (monospace, selectable) with label
    const castIdRow = body.createDiv({ cls: 'cast-log-field-row' });
    castIdRow.createSpan({ cls: 'cast-log-field-label', text: 'Cast ID:' });
    const castIdCode = castIdRow.createEl('code', { cls: 'cast-log-castid', text: record.castId });
    castIdCode.addClass('is-selectable');

    // Context notes section (only if present)
    if (record.contextNotes.length > 0) {
      const contextNotesRow = body.createDiv({ cls: 'cast-log-context-notes-row cast-log-field-row' });
      contextNotesRow.createSpan({ cls: 'cast-log-field-label', text: 'Context notes:' });
      const contextNotesSection = contextNotesRow.createDiv({ cls: 'cast-log-context-notes' });
      for (const notePath of record.contextNotes) {
        const link = contextNotesSection.createEl('a', { text: notePath });
        link.href = '#';
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.#onOpenLink(notePath);
        });
      }
    }

    // Affected files section (only if present)
    if (record.affectedFiles && record.affectedFiles.length > 0) {
      const affectedFilesRow = body.createDiv({ cls: 'cast-log-affected-files-row cast-log-field-row' });
      affectedFilesRow.createSpan({ cls: 'cast-log-field-label', text: 'Affected files:' });
      const affectedFilesSection = affectedFilesRow.createDiv({ cls: 'cast-log-affected-files' });
      for (const filePath of record.affectedFiles) {
        const link = affectedFilesSection.createEl('a', { text: filePath });
        link.href = '#';
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.#onOpenLink(filePath);
        });
      }
    }

    // Follow-up text (only if present and non-empty)
    if (record.followUp) {
      const followUpRow = body.createDiv({ cls: 'cast-log-follow-up-row cast-log-field-row' });
      followUpRow.createSpan({ cls: 'cast-log-field-label', text: 'Follow-up:' });
      followUpRow.createSpan({ text: record.followUp });
    }

    // Execute-on-note indicator (only for live spells, not forge, and only when true)
    if (record.spellPath !== FORGE_SPELL_PATH && record.executeOnNote === true) {
      const executeOnNoteRow = body.createDiv({ cls: 'cast-log-execute-on-note-row cast-log-field-row' });
      executeOnNoteRow.createSpan({ cls: 'cast-log-field-label', text: 'Runs on note:' });
      executeOnNoteRow.createSpan({ text: '✓' });
    }
  }
}
