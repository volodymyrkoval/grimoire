import { describe, it, expect, beforeEach } from 'vitest';
import { App, TFile } from 'obsidian';
import { readCastingFrontmatter } from '../src/infra/castingFrontmatter';
import { spellPath } from '../src/domain/spells/SpellPath';

describe('readCastingFrontmatter', () => {
  let app: App;

  beforeEach(() => {
    app = new App();
  });

  it('returns parsed casting settings when file has valid grimoire-casting frontmatter', () => {
    // Arrange
    const file = new TFile('test.md', 'spells/test.md');
    const frontmatterData = {
      'grimoire-casting': {
        provider: 'claude-code',
        model: 'claude-sonnet-4-5',
        effort: 'high',
      },
    };
    const registeredFile = Object.assign(file, { frontmatter: frontmatterData });
    app.__registerFile(registeredFile as any);
    app.metadataCache.getFileCache.mockImplementation(() => ({
      frontmatter: frontmatterData,
    }));

    // Act
    const result = readCastingFrontmatter(app, spellPath('spells/test.md'));

    // Assert
    expect(result).toEqual({
      provider: 'claude-code',
      model: 'claude-sonnet-4-5',
      effort: 'high',
    });
  });

  it('returns null when file has no grimoire-casting key in frontmatter', () => {
    // Arrange
    const file = new TFile('test.md', 'spells/test.md');
    const frontmatterData = {
      'other-key': { some: 'value' },
    };
    const registeredFile = Object.assign(file, { frontmatter: frontmatterData });
    app.__registerFile(registeredFile as any);
    app.metadataCache.getFileCache.mockImplementation(() => ({
      frontmatter: frontmatterData,
    }));

    // Act
    const result = readCastingFrontmatter(app, spellPath('spells/test.md'));

    // Assert
    expect(result).toBeNull();
  });

  it('returns null when file is not found in vault', () => {
    // No file registered

    // Act
    const result = readCastingFrontmatter(app, spellPath('spells/nonexistent.md'));

    // Assert
    expect(result).toBeNull();
  });

  it('returns null when frontmatter block is malformed (not an object)', () => {
    // Arrange
    const file = new TFile('test.md', 'spells/test.md');
    const frontmatterData = {
      'grimoire-casting': 'not-an-object',
    };
    const registeredFile = Object.assign(file, { frontmatter: frontmatterData });
    app.__registerFile(registeredFile as any);
    app.metadataCache.getFileCache.mockImplementation(() => ({
      frontmatter: frontmatterData,
    }));

    // Act
    const result = readCastingFrontmatter(app, spellPath('spells/test.md'));

    // Assert
    expect(result).toBeNull();
  });
});
