import { describe, it, expect } from 'vitest';
import { App, TFile } from './obsidian';

describe('obsidian mock — fileManager and getAbstractFileByPath', () => {
  it('getAbstractFileByPath returns null for unregistered paths', () => {
    const app = new App();
    expect(app.vault.getAbstractFileByPath('spells/x.md')).toBeNull();
  });

  it('getAbstractFileByPath returns the registered TFile', () => {
    const app = new App();
    const file = new TFile('x', 'spells/x.md');
    app.__registerFile(file);
    expect(app.vault.getAbstractFileByPath('spells/x.md')).toBe(file);
  });

  it('processFrontMatter mutates the file frontmatter in place', async () => {
    const app = new App();
    const file = new TFile('x', 'spells/x.md');
    app.__registerFile(file);
    (file as any).frontmatter = { 'grimoire-hotkey': 'g' };

    await app.fileManager.processFrontMatter(file as any, (fm) => {
      delete fm['grimoire-hotkey'];
    });

    expect((file as any).frontmatter['grimoire-hotkey']).toBeUndefined();
  });

  it('processFrontMatter initialises frontmatter to {} if absent', async () => {
    const app = new App();
    const file = new TFile('x', 'spells/x.md');
    app.__registerFile(file);

    await app.fileManager.processFrontMatter(file as any, (fm) => {
      fm['new-key'] = 'value';
    });

    expect((file as any).frontmatter['new-key']).toBe('value');
  });
});
