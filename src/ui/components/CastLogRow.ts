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
  #startedSpan!: HTMLElement;
  #durationSpan!: HTMLElement;
  #statusBadgeSpan!: HTMLElement;
  #nameSpan!: HTMLElement;
  #modelBadgeSpan!: HTMLElement;
  #bodyEl!: HTMLElement;
  readonly #onOpenLink: (path: string) => void;

  constructor(container: HTMLElement, record: CastRecord, onOpenLink: (path: string) => void) {
    this.#record = record;
    this.#onOpenLink = onOpenLink;
    this.el = container.createDiv({ cls: 'cast-log-row' });
  }

  render(expanded: boolean, now: Date, onToggle: () => void): void {
    if (expanded) this.el.addClass('is-expanded');
    this.#buildHeader(this.#record, now, onToggle);
    this.#bodyEl = this.el.createDiv({ cls: 'cast-log-row-body' });
    this.#renderBody(this.#record);
  }

  get castId(): string {
    return this.#record.castId;
  }

  /** Called by CastLogList when the same castId receives an updated record. */
  update(record: CastRecord, expanded: boolean, now: Date): void {
    this.#record = record;
    updateNameSpan(this.#nameSpan, record);
    updateModelBadgeSpan(this.#modelBadgeSpan, record);
    updateStartedSpan(this.#startedSpan, record, now);
    updateDurationSpan(this.#durationSpan, record, now);
    updateStatusBadgeSpan(this.#statusBadgeSpan, record);
    this.#bodyEl.empty();
    this.#renderBody(record);
    this.el.toggleClass('is-expanded', expanded);
  }

  repaintTimes(now: Date): void {
    this.#startedSpan.textContent = formatRelativeTime(new Date(this.#record.castedTs), now);
    if (!this.#record.endedTs) {
      this.#durationSpan.textContent = formatDuration(durationMs(this.#record, now));
    }
  }

  #buildHeader(record: CastRecord, now: Date, onToggle: () => void): void {
    const header = this.el.createDiv({ cls: 'cast-log-row-header' });
    header.addEventListener('click', onToggle);
    this.#nameSpan = buildNameSpan(header, record);
    this.#modelBadgeSpan = buildModelBadgeSpan(header, record);
    this.#startedSpan = buildStartedSpan(header, record, now);
    this.#durationSpan = buildDurationSpan(header, record, now);
    this.#statusBadgeSpan = buildStatusBadgeSpan(header, record);
  }

  #renderBody(record: CastRecord): void {
    appendCastIdRow(this.#bodyEl, record);
    appendContextNotesRow(this.#bodyEl, record, this.#onOpenLink);
    appendAffectedFilesRow(this.#bodyEl, record, this.#onOpenLink);
    appendFollowUpRow(this.#bodyEl, record);
    appendExecuteOnNoteRow(this.#bodyEl, record);
  }
}

function buildNameSpan(header: HTMLElement, record: CastRecord): HTMLElement {
  const displayName = resolveDisplayName(record);
  const span = header.createSpan({ cls: 'cast-log-display-name', text: displayName });
  span.title = displayName;
  return span;
}

function buildModelBadgeSpan(header: HTMLElement, record: CastRecord): HTMLElement {
  const text = record.effort ? `${record.model} ${record.effort}` : record.model;
  return header.createSpan({ cls: 'cast-log-model-badge', text });
}

function buildStartedSpan(header: HTMLElement, record: CastRecord, now: Date): HTMLElement {
  return header.createSpan({
    cls: 'cast-log-started',
    text: formatRelativeTime(new Date(record.castedTs), now),
  });
}

function buildDurationSpan(header: HTMLElement, record: CastRecord, now: Date): HTMLElement {
  return header.createSpan({
    cls: 'cast-log-duration',
    text: formatDuration(durationMs(record, now)),
  });
}

function buildStatusBadgeSpan(header: HTMLElement, record: CastRecord): HTMLElement {
  const { label, cls } = statusBadge(record.status);
  return header.createSpan({ cls: `cast-log-status-badge ${cls}`, text: label });
}

function updateNameSpan(span: HTMLElement, record: CastRecord): void {
  const displayName = resolveDisplayName(record);
  span.textContent = displayName;
  span.title = displayName;
}

function updateModelBadgeSpan(span: HTMLElement, record: CastRecord): void {
  span.textContent = record.effort ? `${record.model} ${record.effort}` : record.model;
}

function updateStartedSpan(span: HTMLElement, record: CastRecord, now: Date): void {
  span.textContent = formatRelativeTime(new Date(record.castedTs), now);
}

function updateDurationSpan(span: HTMLElement, record: CastRecord, now: Date): void {
  span.textContent = formatDuration(durationMs(record, now));
}

function updateStatusBadgeSpan(span: HTMLElement, record: CastRecord): void {
  const { label, cls } = statusBadge(record.status);
  span.textContent = label;
  span.className = `cast-log-status-badge ${cls}`;
}

function appendCastIdRow(body: HTMLElement, record: CastRecord): void {
  const row = body.createDiv({ cls: 'cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Cast ID:' });
  row.createEl('code', { cls: 'cast-log-castid', text: record.castId }).addClass('is-selectable');
}

function appendContextNotesRow(
  body: HTMLElement,
  record: CastRecord,
  onOpenLink: (path: string) => void
): void {
  if (record.contextNotes.length === 0) return;
  const row = body.createDiv({ cls: 'cast-log-context-notes-row cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Context notes:' });
  const section = row.createDiv({ cls: 'cast-log-context-notes' });
  for (const notePath of record.contextNotes) {
    const link = section.createEl('a', { text: notePath });
    link.href = '#';
    link.addEventListener('click', (e) => { e.preventDefault(); onOpenLink(notePath); });
  }
}

function appendAffectedFilesRow(
  body: HTMLElement,
  record: CastRecord,
  onOpenLink: (path: string) => void
): void {
  if (!record.affectedFiles || record.affectedFiles.length === 0) return;
  const row = body.createDiv({ cls: 'cast-log-affected-files-row cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Affected files:' });
  const section = row.createDiv({ cls: 'cast-log-affected-files' });
  for (const filePath of record.affectedFiles) {
    const link = section.createEl('a', { text: filePath });
    link.href = '#';
    link.addEventListener('click', (e) => { e.preventDefault(); onOpenLink(filePath); });
  }
}

function appendFollowUpRow(body: HTMLElement, record: CastRecord): void {
  if (!record.followUp) return;
  const row = body.createDiv({ cls: 'cast-log-follow-up-row cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Follow-up:' });
  row.createSpan({ text: record.followUp });
}

function appendExecuteOnNoteRow(body: HTMLElement, record: CastRecord): void {
  if (record.spellPath === FORGE_SPELL_PATH || record.executeOnNote !== true) return;
  const row = body.createDiv({ cls: 'cast-log-execute-on-note-row cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Runs on note:' });
  row.createSpan({ text: '✓' });
}
