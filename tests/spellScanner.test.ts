import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TFile } from 'obsidian';
import { getSpells } from '../src/infra/spellScanner';
import { EXECUTE_ON_NOTE_KEY } from '../src/domain/spells/Spell';

vi.mock('obsidian');

describe('getSpells', () => {
  let app: any;

  beforeEach(() => {
    vi.clearAllMocks();
    app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
      },
      metadataCache: {
        getFileCache: vi.fn(() => null),
      },
    };
  });

  it('reads grimoire-execute-on-note: true from frontmatter', () => {
    const file = new TFile('test-spell', 'spells/test-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
        [EXECUTE_ON_NOTE_KEY]: true,
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].executeOnNote).toBe(true);
  });

  it('reads grimoire-execute-on-note: false from frontmatter', () => {
    const file = new TFile('test-spell', 'spells/test-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
        [EXECUTE_ON_NOTE_KEY]: false,
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].executeOnNote).toBe(false);
  });

  it('defaults to true when key is absent', () => {
    const file = new TFile('test-spell', 'spells/test-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].executeOnNote).toBe(true);
  });

  it('defaults to true when value is string "false"', () => {
    const file = new TFile('test-spell', 'spells/test-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
        [EXECUTE_ON_NOTE_KEY]: 'false',
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].executeOnNote).toBe(true);
  });

  it('defaults to true when value is 0', () => {
    const file = new TFile('test-spell', 'spells/test-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
        [EXECUTE_ON_NOTE_KEY]: 0,
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].executeOnNote).toBe(true);
  });
});
