import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CastRecord } from '../../src/castLog/CastRecord';
import { CastLogRow } from '../../src/ui/components/CastLogRow';
import { FORGE_SPELL_PATH } from '../../src/castLog/types';

const NOW = new Date('2026-05-14T12:00:00Z');

describe('CastLogRow', () => {
  describe('expanded body — field labels and conditional rendering', () => {
    it('renders Cast ID with a label', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-abc123',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      expect(body).toBeTruthy();

      // Cast ID row should have a label
      const castIdRow = body.querySelector('.cast-log-field-row');
      expect(castIdRow).toBeTruthy();
      const label = castIdRow!.querySelector('.cast-log-field-label');
      expect(label?.textContent).toBe('Cast ID:');
      const code = castIdRow!.querySelector('code');
      expect(code?.textContent).toBe('cast-abc123');
    });

    it('omits context notes section when empty', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      // Should NOT contain a "Context notes:" label or the dash
      expect(body.textContent).not.toContain('Context notes:');
      expect(body.textContent).not.toContain('—');
    });

    it('renders context notes section with label when present', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: ['Notes/context.md'],
        castedTs: NOW.toISOString(),
      };

      const openLink = vi.fn();
      const row = new CastLogRow(container, record, openLink);
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      const notesRow = body.querySelector('.cast-log-context-notes-row');
      expect(notesRow).toBeTruthy();

      const label = notesRow!.querySelector('.cast-log-field-label');
      expect(label?.textContent).toBe('Context notes:');

      const link = notesRow!.querySelector('a');
      expect(link?.textContent).toBe('Notes/context.md');
    });

    it('renders affected files section with label when present', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        affectedFiles: ['Output.md'],
        castedTs: NOW.toISOString(),
      };

      const openLink = vi.fn();
      const row = new CastLogRow(container, record, openLink);
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      const filesRow = body.querySelector('.cast-log-affected-files-row');
      expect(filesRow).toBeTruthy();

      const label = filesRow!.querySelector('.cast-log-field-label');
      expect(label?.textContent).toBe('Affected files:');

      const link = filesRow!.querySelector('a');
      expect(link?.textContent).toBe('Output.md');
    });

    it('omits affected files section when not present', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      expect(body.textContent).not.toContain('Affected files:');
    });

    it('renders follow-up with label when present', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        followUp: 'Check the output',
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      const followUpRow = body.querySelector('.cast-log-follow-up-row');
      expect(followUpRow).toBeTruthy();

      const label = followUpRow!.querySelector('.cast-log-field-label');
      expect(label?.textContent).toBe('Follow-up:');

      const text = followUpRow!.textContent;
      expect(text).toContain('Check the output');
    });

    it('omits follow-up section when empty', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        followUp: '',
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      expect(body.textContent).not.toContain('Follow-up:');
      expect(body.textContent).not.toContain('—');
    });

    it('omits follow-up section when null', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Test.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        followUp: null,
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      expect(body.textContent).not.toContain('Follow-up:');
    });

    it('renders execute-on-note only for live spells with executeOnNote=true', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Live.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        executeOnNote: true,
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      const executeRow = body.querySelector('.cast-log-execute-on-note-row');
      expect(executeRow).toBeTruthy();

      const label = executeRow!.querySelector('.cast-log-field-label');
      expect(label?.textContent).toBe('Runs on note:');

      const text = executeRow!.textContent;
      expect(text).toContain('✓');
    });

    it('omits execute-on-note when executeOnNote=false', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: 'Spells/Live.md',
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        executeOnNote: false,
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      expect(body.textContent).not.toContain('Runs on note:');
      expect(body.textContent).not.toContain('✗');
    });

    it('omits execute-on-note for forge spells even if executeOnNote=true', () => {
      const container = document.createElement('div');
      const record: CastRecord = {
        castId: 'cast-xyz',
        status: 'done',
        spellPath: FORGE_SPELL_PATH,
        model: 'claude-opus-4-7',
        effort: null,
        contextNotes: [],
        executeOnNote: true,
        castedTs: NOW.toISOString(),
      };

      const row = new CastLogRow(container, record, () => {});
      row.render(true, NOW, () => {});

      const body = container.querySelector('.cast-log-row-body') as HTMLElement;
      expect(body.textContent).not.toContain('Runs on note:');
    });
  });
});
