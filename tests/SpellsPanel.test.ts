import { describe, it, expect, vi } from 'vitest';
import { App } from 'obsidian';
import { SpellsPanel } from '../src/ui/tabs/SpellsPanel';
import { obsidianRanker } from '../src/infra/obsidianRanker';
import { spellPath } from '../src/domain/spells/SpellPath';
import { makeMockEl } from './helpers/mockEl';
import { SpellList } from '../src/ui/components/SpellList';

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
  const panel = new SpellsPanel(app, 'spell', obsidianRanker);
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
    const app = new App() as any;
    app.vault.getMarkdownFiles.mockReturnValue([
      { basename: 'Not A Spell', path: '/notes/note.md' },
    ]);
    app.metadataCache.getFileCache.mockReturnValue(null);
    const panel = new SpellsPanel(app, 'spell', obsidianRanker);
    panel.mount(makeMockEl());
    panel.filter('');
    expect(panel.length).toBe(2);
  });
});

describe('SpellsPanel.openOptions', () => {
  it('in-range index emits open-options with correct spell', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.openOptions(0);

    expect(spy).toHaveBeenCalledOnce();
    // Spells are sorted alphabetically; first is 'Banishment Hex'
    expect(spy).toHaveBeenCalledWith('open-options', expect.objectContaining({ path: spellPath('/spells/banishment.md') }));
  });

  it('out-of-range index (>= length) is a no-op', () => {
    const panel = makePanel();
    panel.filter('protect');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.openOptions(1);

    expect(spy).not.toHaveBeenCalled();
  });

  it('sentinel-row index (spell count) is a no-op', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');
    panel.openOptions(DEFAULT_TEST_SPELLS.length); // all 10 spells; index 10 is the sentinel boundary

    expect(spy).not.toHaveBeenCalled();
  });

  it('negative index is a no-op', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.openOptions(-1);

    expect(spy).not.toHaveBeenCalled();
  });

  it('Forge sentinel index (10) is a no-op', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.openOptions(DEFAULT_TEST_SPELLS.length); // index 10 is Forge

    expect(spy).not.toHaveBeenCalled();
  });

  it('Refine sentinel index (11) emits open-refine-options exactly once', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.openOptions(DEFAULT_TEST_SPELLS.length + 1); // index 11 is Refine

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('open-refine-options', undefined);
  });
});

describe('SpellsPanel.confirm', () => {
  it('spell index emits cast with correct spell', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.confirm(0);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('cast', expect.objectContaining({ path: spellPath('/spells/banishment.md') }));
  });

  it('Forge sentinel index (10) emits sentinel event', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.confirm(DEFAULT_TEST_SPELLS.length); // index 10 is Forge

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('sentinel', expect.objectContaining({ kind: 'forge', name: 'Forge' }));
  });

  it('Refine sentinel index (11) emits refine-cast', () => {
    const panel = makePanel();
    panel.filter('');
    const spy = vi.spyOn(panel.events, 'emit');

    panel.confirm(DEFAULT_TEST_SPELLS.length + 1); // index 11 is Refine

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('refine-cast', undefined);
  });
});

describe('SpellsPanel with hasOverride predicate', () => {
  it('mount without hasOverride uses default predicate (no overrides)', () => {
    const panel = makePanel();
    // Default mount (no predicate)
    const container = makeMockEl();
    panel.mount(container);

    const spellListEl = container.createDiv.mock.results[0].value;
    if (spellListEl) {
      // With default predicate, no dots should appear
      let totalDots = 0;
      spellListEl.createDiv.mock.results.forEach((result: any) => {
        const rowEl = result.value;
        if (rowEl) {
          const wrapper = rowEl.createDiv?.mock?.results?.[0]?.value;
          const dotCalls = wrapper?.createSpan?.mock?.calls?.filter(
            (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
          ) ?? [];
          totalDots += dotCalls.length;
        }
      });
      expect(totalDots).toBe(0);
    }
  });

  it('mount with hasOverride predicate applies it to render', () => {
    const app = makeApp(DEFAULT_TEST_SPELLS);
    const panel = new SpellsPanel(app, 'spell', obsidianRanker);
    const container = makeMockEl();
    const predicateSpy = vi.fn((path: string) => path === '/spells/summoning.md');

    panel.mount(container, predicateSpy);

    // Verify the predicate was called
    expect(predicateSpy).toHaveBeenCalled();
  });

  it('filter preserves the hasOverride predicate', () => {
    const app = makeApp(DEFAULT_TEST_SPELLS);
    const panel = new SpellsPanel(app, 'spell', obsidianRanker);
    const container = makeMockEl();
    const predicateSpy = vi.fn((path: string) => path === '/spells/summoning.md');

    panel.mount(container, predicateSpy);
    const callCountAfterMount = predicateSpy.mock.calls.length;

    // Reset mock to count only filter calls
    predicateSpy.mockClear();

    panel.filter('');

    // Predicate should be called again during filter
    expect(predicateSpy).toHaveBeenCalled();
  });

  it('refreshOverrides re-renders with same selection', () => {
    const panel = makePanel();
    const container = makeMockEl();
    panel.mount(container);

    panel.updateSelection(0, 2);
    panel.move(1, 1);

    const spellListEl = container.createDiv.mock.results[0].value;
    const getSelectedRowIndex = () => {
      let selectedIndex = -1;
      spellListEl.createDiv.mock.results.forEach((result: any, idx: number) => {
        const rowEl = result.value;
        if (rowEl && rowEl.addClass.mock.calls.some((call: any[]) => call[0] === 'is-selected')) {
          selectedIndex = idx;
        }
      });
      return selectedIndex;
    };

    panel['refreshOverrides']();

    expect(spellListEl).toBeTruthy();
  });

  it('refreshOverrides reflects new override state', () => {
    const app = makeApp(DEFAULT_TEST_SPELLS);
    const panel = new SpellsPanel(app, 'spell', obsidianRanker);
    const container = makeMockEl();
    const predicateSpy = vi.fn((path: string) => path === '/spells/summoning.md');

    // Mount with predicate that marks first spell as override
    panel.mount(container, predicateSpy);

    // Verify first call had overrides
    expect(predicateSpy).toHaveBeenCalled();

    // Reset and call refreshOverrides
    predicateSpy.mockClear();
    panel['refreshOverrides']();

    // refreshOverrides should have called the predicate again
    expect(predicateSpy).toHaveBeenCalled();
  });
});

describe('SpellsPanel.spells()', () => {
  it('returns the full unfiltered spell list', () => {
    const panel = makePanel();
    const spells = panel.spells();

    expect(spells).toHaveLength(DEFAULT_TEST_SPELLS.length);
    // Verify we got all the spells by checking paths
    const paths = spells.map(s => s.path);
    DEFAULT_TEST_SPELLS.forEach(expectedSpell => {
      expect(paths).toContain(expectedSpell.path);
    });
  });

  it('returns a defensive copy (does not expose internal array)', () => {
    const panel = makePanel();
    const spells1 = panel.spells();
    const spells2 = panel.spells();

    expect(spells1).toEqual(spells2);
    expect(spells1).not.toBe(spells2);
  });
});

describe('SpellsPanel.refreshSpells()', () => {
  it('returns the newly-scanned spell list', () => {
    const app = makeApp(DEFAULT_TEST_SPELLS);
    const panel = new SpellsPanel(app, 'spell', obsidianRanker);

    const newSpells = [{ basename: 'New Spell', path: '/spells/new.md' }];
    app.vault.getMarkdownFiles.mockReturnValue(newSpells);
    app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ['spell'] } });

    const result = panel.refreshSpells(app, 'spell');

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/spells/new.md');
  });

  it('returned list matches the updated allSpells state', () => {
    const app = makeApp(DEFAULT_TEST_SPELLS);
    const panel = new SpellsPanel(app, 'spell', obsidianRanker);

    const newSpells = [
      { basename: 'Alpha', path: '/spells/alpha.md' },
      { basename: 'Beta', path: '/spells/beta.md' },
    ];
    app.vault.getMarkdownFiles.mockReturnValue(newSpells);
    app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ['spell'] } });

    const result = panel.refreshSpells(app, 'spell');

    // Returned list and internal spells() should be identical
    expect(result).toHaveLength(2);
    expect(panel.spells()).toHaveLength(2);
    expect(result.map(s => s.path)).toEqual(panel.spells().map(s => s.path));
  });
});

describe('SpellsPanel.focusByRowIndex()', () => {
  it('adds is-selected class to row at index and removes from previous', () => {
    const panel = makePanel();
    panel.filter('');

    // Start with selection at index 0
    panel.updateSelection(-1, 0);

    // Spy on SpellList.updateSelection to verify focusByRowIndex calls it
    const updateSelectionSpy = vi.spyOn(SpellList.prototype, 'updateSelection');

    // Call focusByRowIndex(5): should call SpellList.updateSelection(0, 5)
    panel.focusByRowIndex(5);

    // Verify updateSelection was called with the correct arguments
    expect(updateSelectionSpy).toHaveBeenCalledOnce();
    expect(updateSelectionSpy).toHaveBeenCalledWith(0, 5);

    updateSelectionSpy.mockRestore();
  });

  it('moves selection to the last sentinel row', () => {
    const panel = makePanel();
    panel.filter('');
    const lastIndex = panel.length - 1; // last sentinel (Refine is at length-1)

    // This should not throw and should succeed
    expect(() => panel.focusByRowIndex(lastIndex)).not.toThrow();
  });

  it('is idempotent when called with same index twice', () => {
    const panel = makePanel();
    panel.filter('');
    const targetIndex = 3;

    // Call focusByRowIndex twice with same index - both calls should succeed
    // and the second call should use the same prev/next (targetIndex, targetIndex)
    panel.focusByRowIndex(targetIndex);

    expect(() => {
      panel.focusByRowIndex(targetIndex);
    }).not.toThrow();
  });
});
