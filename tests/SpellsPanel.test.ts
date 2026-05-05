import { describe, it, expect, vi } from 'vitest';
import { App } from 'obsidian';
import { SpellsPanel } from '../src/ui/tabs/SpellsPanel';

function makeMockEl(): any {
  const el: any = {
    empty: vi.fn(),
    addClass: vi.fn(),
    removeClass: vi.fn(),
    scrollIntoView: vi.fn(),
    onClickEvent: vi.fn(),
    style: {},
    offsetHeight: 0,
  };
  el.createEl = vi.fn(() => makeMockEl());
  el.createDiv = vi.fn(() => makeMockEl());
  el.createSpan = vi.fn(() => makeMockEl());
  return el;
}

const DEFAULT_TEST_SPELLS = [
  { basename: 'Summoning Circle', path: '/spells/summoning.md' },
  { basename: 'Protection Rune', path: '/spells/protection.md' },
  { basename: 'Transmutation', path: '/spells/transmutation.md' },
  { basename: 'Scrying Mirror', path: '/spells/scrying.md' },
  { basename: 'Healing Incantation', path: '/spells/healing.md' },
  { basename: 'Banishment Hex', path: '/spells/banishment.md' },
  { basename: 'Divination Ritual', path: '/spells/divination.md' },
  { basename: 'Enchantment Charm', path: '/spells/enchantment.md' },
  { basename: 'Restoration Spell', path: '/spells/restoration.md' },
  { basename: 'Warding Barrier', path: '/spells/warding.md' },
];

function makeApp(spells: Array<{ basename: string; path: string }> = []) {
  const app = new App() as any;
  app.vault.getMarkdownFiles.mockReturnValue(spells);
  app.metadataCache.getFileCache.mockReturnValue(
    spells.length > 0 ? { frontmatter: { tags: ['spell'] } } : null
  );
  return app;
}

function makePanel(spells = DEFAULT_TEST_SPELLS): SpellsPanel {
  const app = makeApp(spells);
  const panel = new SpellsPanel(app, 'spell');
  panel.mount(makeMockEl());
  return panel;
}

describe('SpellsPanel.filter', () => {
  it('empty query returns all 10 spells plus both sentinels', () => {
    const panel = makePanel();
    panel.filter('');
    expect(panel.length).toBe(12);
  });

  it('substring-matching query "protect" returns Protection Rune plus sentinels', () => {
    const panel = makePanel();
    panel.filter('protect');
    expect(panel.length).toBe(3);
  });

  it('fuzzy query "hlin" matches Healing Incantation but not via substring', () => {
    const panel = makePanel();
    panel.filter('hlin');
    expect(panel.length).toBe(3);
  });

  it('query with no spell match returns only sentinels', () => {
    const panel = makePanel();
    panel.filter('forge');
    expect(panel.length).toBe(2);
  });

  it('returns 0 as focus index when spells are found', () => {
    const panel = makePanel();
    const index = panel.filter('protect');
    expect(index).toBe(0);
  });

  it('focuses Forge sentinel at index 0 when only sentinels remain', () => {
    const panel = makePanel();
    const index = panel.filter('forge');
    expect(index).toBe(0);
  });
});

describe('SpellsPanel with vault', () => {
  it('empty vault returns only sentinels', () => {
    const panel = makePanel([]);
    panel.filter('');
    expect(panel.length).toBe(2);
  });

  it('one matching file returns 1 spell plus sentinels', () => {
    const panel = makePanel([{ basename: 'Fire Bolt', path: '/spells/fire.md' }]);
    panel.filter('');
    expect(panel.length).toBe(3);
  });

  it('untagged files return no spells plus sentinels', () => {
    // makeApp returns null from getFileCache when spells array is empty,
    // but here we need files with no matching tag — set up manually
    const app = new App() as any;
    app.vault.getMarkdownFiles.mockReturnValue([
      { basename: 'Not A Spell', path: '/notes/note.md' },
    ]);
    // null cache means no tags => no match
    app.metadataCache.getFileCache.mockReturnValue(null);
    const panel = new SpellsPanel(app, 'spell');
    panel.mount(makeMockEl());
    panel.filter('');
    expect(panel.length).toBe(2);
  });
});
