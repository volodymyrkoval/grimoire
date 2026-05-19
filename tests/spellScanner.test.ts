import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TFile } from 'obsidian';
import { getSpells } from '../src/infra/spellScanner';
import { EXECUTE_ON_NOTE_KEY } from '../src/domain/spells/Spell';
import { HOTKEY_FRONTMATTER_KEY } from '../src/domain/spells/Hotkey';
import { SENTINEL_FRONTMATTER_KEY, REFINE_SENTINEL_FRONTMATTER_VALUE } from '../src/refine/refineSentinel';

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

  it('excludes sentinel-marked files even when tagged', () => {
    const taggedFile = new TFile('regular-spell', 'spells/regular-spell.md');
    const sentinelFile = new TFile('refine-template', 'templates/refine-template.md');
    app.vault.getMarkdownFiles.mockReturnValue([taggedFile, sentinelFile]);
    app.metadataCache.getFileCache.mockImplementation((file: any) => {
      if (file.basename === 'regular-spell') {
        return {
          frontmatter: {
            tags: 'spell',
          },
          tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
        };
      }
      if (file.basename === 'refine-template') {
        return {
          frontmatter: {
            tags: 'spell',
            [SENTINEL_FRONTMATTER_KEY]: REFINE_SENTINEL_FRONTMATTER_VALUE,
          },
          tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
        };
      }
      return null;
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].name).toBe('regular-spell');
  });

  it('includes tagged files that are not sentinel-marked', () => {
    const file = new TFile('regular-spell', 'spells/regular-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].name).toBe('regular-spell');
  });

  it('reads grimoire-hotkey from frontmatter', () => {
    const file = new TFile('test-spell', 'spells/test-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
        [HOTKEY_FRONTMATTER_KEY]: 'g',
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].hotkey).toBe('g');
  });

  it('rejects invalid grimoire-hotkey value', () => {
    const file = new TFile('test-spell', 'spells/test-spell.md');
    app.vault.getMarkdownFiles.mockReturnValue([file]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        tags: 'spell',
        [HOTKEY_FRONTMATTER_KEY]: 'GO',
      },
      tags: [{ tag: '#spell', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } } }],
    });

    const spells = getSpells(app, 'spell');

    expect(spells).toHaveLength(1);
    expect(spells[0].hotkey).toBeNull();
  });

  it('treats missing grimoire-hotkey as null', () => {
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
    expect(spells[0].hotkey).toBeNull();
  });
});
