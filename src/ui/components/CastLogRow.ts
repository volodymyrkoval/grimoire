import type { CastRecord } from '../../castLog/CastRecord';
import { FORGE_SPELL_PATH, REFINE_SPELL_PATH } from '../../domain/spells/SystemSpellPaths';
import { formatRelativeTime } from '../../castLog/format/relativeTime';
import { formatDuration } from '../../castLog/format/duration';
import { resolveDisplayName } from '../../castLog/format/displayName';
import { statusBadge } from './statusBadge';
import { durationMs } from '../../castLog/format/durationMs';
import { toDisplayPath } from '../../castLog/format/toDisplayPath';
import { basename } from '../../castLog/format/basename';

/**
 * Renders a single cast record as an expandable row with header and body sections.
 * Owns the DOM element (.el) and exposes update/repaintTimes for partial rerenders.
 */
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
  readonly #vaultRootAbs: string;

  constructor(
    container: HTMLElement,
    record: CastRecord,
    onOpenLink: (path: string) => void,
    vaultRootAbs = '',
  ) {
    this.#record = record;
    this.#onOpenLink = onOpenLink;
    this.#vaultRootAbs = vaultRootAbs;
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
    appendContextNotesRow(this.#bodyEl, record, this.#onOpenLink, this.#vaultRootAbs);
    appendAffectedFilesRow(this.#bodyEl, record, this.#onOpenLink, this.#vaultRootAbs);
    appendFollowUpRow(this.#bodyEl, record);
    appendExecuteOnNoteRow(this.#bodyEl, record);
  }
}

/** Builds and returns the spell name span for the row header. */
function buildNameSpan(header: HTMLElement, record: CastRecord): HTMLElement {
  const displayName = resolveDisplayName(record);
  const span = header.createSpan({ cls: 'cast-log-display-name', text: displayName });
  span.title = displayName;
  return span;
}

/** Builds and returns the model/effort badge span for the row header. */
function buildModelBadgeSpan(header: HTMLElement, record: CastRecord): HTMLElement {
  const text = record.effort ? `${record.model} ${record.effort}` : record.model;
  return header.createSpan({ cls: 'cast-log-model-badge', text });
}

/** Builds and returns the relative-time span for the row header. */
function buildStartedSpan(header: HTMLElement, record: CastRecord, now: Date): HTMLElement {
  return header.createSpan({
    cls: 'cast-log-started',
    text: formatRelativeTime(new Date(record.castedTs), now),
  });
}

/** Builds and returns the duration span for the row header. */
function buildDurationSpan(header: HTMLElement, record: CastRecord, now: Date): HTMLElement {
  return header.createSpan({
    cls: 'cast-log-duration',
    text: formatDuration(durationMs(record, now)),
  });
}

/** Builds and returns the status badge span for the row header. */
function buildStatusBadgeSpan(header: HTMLElement, record: CastRecord): HTMLElement {
  const { label, cls } = statusBadge(record.status);
  return header.createSpan({ cls: `cast-log-status-badge ${cls}`, text: label });
}

/** Updates the name span text and title in place. */
function updateNameSpan(span: HTMLElement, record: CastRecord): void {
  const displayName = resolveDisplayName(record);
  span.textContent = displayName;
  span.title = displayName;
}

/** Updates the model badge text in place. */
function updateModelBadgeSpan(span: HTMLElement, record: CastRecord): void {
  span.textContent = record.effort ? `${record.model} ${record.effort}` : record.model;
}

/** Updates the started time text in place. */
function updateStartedSpan(span: HTMLElement, record: CastRecord, now: Date): void {
  span.textContent = formatRelativeTime(new Date(record.castedTs), now);
}

/** Updates the duration text in place. */
function updateDurationSpan(span: HTMLElement, record: CastRecord, now: Date): void {
  span.textContent = formatDuration(durationMs(record, now));
}

/** Updates the status badge text and class in place. */
function updateStatusBadgeSpan(span: HTMLElement, record: CastRecord): void {
  const { label, cls } = statusBadge(record.status);
  span.textContent = label;
  span.className = `cast-log-status-badge ${cls}`;
}

/** Appends a cast ID field row to the body. */
function appendCastIdRow(body: HTMLElement, record: CastRecord): void {
  const row = body.createDiv({ cls: 'cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Cast ID:' });
  row.createEl('code', { cls: 'cast-log-castid', text: record.castId }).addClass('is-selectable');
}

interface PathLinkListOptions {
  label: string;
  cssRowClass: string;
  cssSectionClass: string;
  paths: string[];
  vaultRootAbs: string;
  onOpenLink: (path: string) => void;
}

/**
 * Appends a labelled list of clickable path links to body.
 * Link text is the basename of the display-normalised path.
 * The click handler passes the display-normalised path to onOpenLink.
 */
function appendPathLinkList(body: HTMLElement, opts: PathLinkListOptions): void {
  const { label, cssRowClass, cssSectionClass, paths, vaultRootAbs, onOpenLink } = opts;
  const row = body.createDiv({ cls: `${cssRowClass} cast-log-field-row` });
  row.createSpan({ cls: 'cast-log-field-label', text: label });
  const section = row.createDiv({ cls: cssSectionClass });
  for (const rawPath of paths) {
    const displayPath = toDisplayPath(rawPath, vaultRootAbs);
    const linkText = vaultRootAbs !== '' ? basename(displayPath) : displayPath;
    const link = section.createEl('a', { text: linkText });
    link.href = '#';
    link.addEventListener('click', (e) => { e.preventDefault(); onOpenLink(displayPath); });
  }
}

/** Appends context notes as clickable links if any exist. */
function appendContextNotesRow(
  body: HTMLElement,
  record: CastRecord,
  onOpenLink: (path: string) => void,
  vaultRootAbs: string,
): void {
  if (record.contextNotes.length === 0) return;
  appendPathLinkList(body, {
    label: 'Context notes:',
    cssRowClass: 'cast-log-context-notes-row',
    cssSectionClass: 'cast-log-context-notes',
    paths: record.contextNotes,
    vaultRootAbs,
    onOpenLink,
  });
}

/** Appends affected files as clickable links if any exist. */
function appendAffectedFilesRow(
  body: HTMLElement,
  record: CastRecord,
  onOpenLink: (path: string) => void,
  vaultRootAbs: string,
): void {
  if (!record.affectedFiles || record.affectedFiles.length === 0) return;
  const label = vaultRootAbs !== '' ? 'Affected notes:' : 'Affected files:';
  appendPathLinkList(body, {
    label,
    cssRowClass: 'cast-log-affected-files-row',
    cssSectionClass: 'cast-log-affected-files',
    paths: record.affectedFiles,
    vaultRootAbs,
    onOpenLink,
  });
}

/** Appends follow-up instruction text if present. */
function appendFollowUpRow(body: HTMLElement, record: CastRecord): void {
  if (!record.followUp) return;
  const row = body.createDiv({ cls: 'cast-log-follow-up-row cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Follow-up:' });
  row.createSpan({ text: record.followUp });
}

/** Appends execution-on-note indicator if applicable (non-Forge, non-Refine, executeOnNote=true). */
function appendExecuteOnNoteRow(body: HTMLElement, record: CastRecord): void {
  if (
    record.spellPath === FORGE_SPELL_PATH ||
    record.spellPath === REFINE_SPELL_PATH ||
    record.executeOnNote !== true
  ) {
    return;
  }
  const row = body.createDiv({ cls: 'cast-log-execute-on-note-row cast-log-field-row' });
  row.createSpan({ cls: 'cast-log-field-label', text: 'Runs on note:' });
  row.createSpan({ text: '✓' });
}
