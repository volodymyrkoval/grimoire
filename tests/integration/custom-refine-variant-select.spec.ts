/**
 * Integration test: CommandPopup → Refine OptionsPanel → RefineVariantSelect seam.
 *
 * Seam: the boundary between CommandPopup / OptionsDetail (parent) and
 * the RefineVariantSelect widget (real child), rendered inside form.options-panel.
 *
 * Covers:
 *   D0-a  Zero sentinel entries → no variant <select> in the Refine options panel
 *   D0-b  One sentinel entry → select renders with Default (built-in) first,
 *          changing selection writes refinePathOverride to session map
 *   D0-c  Reset clears the session map entry (refinePathOverride gone)
 *   D0-d  Sentinel-marked file (also spell-tagged) does not appear in the main spell list
 *
 * Navigation: ArrowUp once from index 0 wraps to the Refine sentinel row.
 *
 * Sentinel setup: the harness includes a file with BOTH the spell tag AND
 * `sentinel: refine` frontmatter. This makes D0-d a real exclusion test —
 * without the isRefineSentinel filter in getSpells, the file would appear.
 */

import { describe, it, expect, vi } from 'vitest';
import { App } from 'obsidian';
import { CommandPopup } from '../../src/ui/CommandPopup';
import { RefineVariantSelect } from '../../src/ui/options/RefineVariantSelect';
import { obsidianRanker } from '../../src/infra/obsidianRanker';
import { modelId } from '../../src/domain/settings/ModelId';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { REFINE_SENTINEL_PATH } from '../../src/domain/spells/Spell';
import type { CastLogPanelDeps } from '../../src/ui/tabs/CastLogPanel';
import { createPopupHarness } from './harness';

// A sentinel file that also carries the spell tag — makes D0-d a genuine exclusion test.
const SENTINEL_FILE = { basename: 'My Refine', path: 'spells/My Refine.md' };

const BASE_TEST_FILES = [
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

function makeFakeCastLogPanelDeps(): Omit<CastLogPanelDeps, 'openLink'> {
  return {
    source: { load: vi.fn().mockResolvedValue([]) },
    refresh: { start: vi.fn(), stop: vi.fn() },
    tick: { start: vi.fn(), stop: vi.fn() },
    now: () => new Date(),
  };
}

/**
 * Creates a CommandPopup harness where SENTINEL_FILE is in the initial getMarkdownFiles
 * result with BOTH the spell tag AND sentinel: refine frontmatter. This means:
 * - SpellsPanel (constructed before open) will scan the file and the exclusion filter
 *   must prevent it from appearing in the spell list (D0-d).
 * - getRefineSentinels (called at panel-open time) will return SENTINEL_FILE (D0-b, D0-c).
 */
function createHarnessWithSentinelFromStart(sessionMap: OptionsSessionMap, options?: {
  settingsActiveRefinePath?: string | null;
}): {
  modal: CommandPopup;
  contentEl: HTMLElement;
  pressKey(key: string): boolean;
  visibleSpellRows(): HTMLElement[];
  clickBack(): void;
} {
  const app = new App() as any;

  // Include SENTINEL_FILE in the initial file list — present from construction time
  app.vault.getMarkdownFiles.mockReturnValue([...BASE_TEST_FILES, SENTINEL_FILE]);

  // SENTINEL_FILE has both spell tag AND sentinel: refine — tests the exclusion filter
  app.metadataCache.getFileCache.mockImplementation((file: any) => {
    if (file.path === SENTINEL_FILE.path) {
      return { frontmatter: { tags: ['spell'], sentinel: 'refine' } };
    }
    return { frontmatter: { tags: ['spell'] } };
  });

  const overrides = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  const modal = new CommandPopup({
    app,
    spellTag: 'spell',
    rankSpells: obsidianRanker,
    imprintAction: vi.fn(),
    castAction: vi.fn(),
    refineCastAction: vi.fn(),
    defaults: { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' },
    overrides,
    sessionMap,
    castLogPanelDeps: makeFakeCastLogPanelDeps(),
    settingsActiveRefinePath: options?.settingsActiveRefinePath ?? null,
    forgeUpdateAction: vi.fn(),
    spellContentReader: { read: vi.fn(async () => '') },
    hotkeyEraser: vi.fn().mockResolvedValue(undefined),
  });

  modal.open();
  const { contentEl } = modal;

  function pressKey(key: string): boolean {
    return (modal.scope as unknown as { dispatch(k: string, m: string[]): boolean }).dispatch(key, []);
  }

  return {
    modal,
    contentEl,
    pressKey,
    visibleSpellRows(): HTMLElement[] {
      return Array.from(contentEl.querySelectorAll('.spells-row')) as HTMLElement[];
    },
    clickBack(): void {
      const buttons = Array.from(contentEl.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent?.includes('← back'));
      if (!btn) throw new Error('Back button not found');
      btn.dispatchEvent(new Event('click'));
    },
  };
}

/** Navigate to the Refine sentinel (ArrowUp from index 0 wraps to the last item). */
function navigateToRefine(pressKey: (key: string) => boolean): void {
  pressKey('ArrowUp');
}

describe('custom-refine-variant-select integration — RefineVariantSelect seam', () => {
  // ------------------------------------------------------------------ D0-a
  it('D0-a: no sentinel-marked file → no variant <select> in Refine options panel', () => {
    // Default harness: getFileCache returns spell tags only, no sentinel
    const h = createPopupHarness();

    h.pressKey('ArrowUp'); // navigate to Refine
    h.pressKey('ArrowRight'); // open options panel

    const form = h.contentEl.querySelector('form.options-panel');
    expect(form).not.toBeNull();

    // No <select> with a "Default (built-in)" option should be present
    const selects = Array.from(form!.querySelectorAll('select'));
    const variantSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => opt.text === 'Default (built-in)')
    );
    expect(variantSelect).toBeUndefined();
  });

  // ------------------------------------------------------------------ D0-b
  it('D0-b: one sentinel entry → select appears with Default (built-in) first and the sentinel file, onChange writes session map', () => {
    const sessionMap = new OptionsSessionMap();
    const h = createHarnessWithSentinelFromStart(sessionMap);

    navigateToRefine(h.pressKey);
    h.pressKey('ArrowRight'); // open options panel

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement | null;
    expect(form).not.toBeNull();

    // A variant <select> must be present (because one sentinel entry exists)
    const selects = Array.from(form!.querySelectorAll('select'));
    const variantSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => opt.text === 'Default (built-in)')
    ) as HTMLSelectElement | undefined;
    expect(variantSelect).toBeDefined();
    expect(variantSelect).not.toBeNull();

    // First option is "Default (built-in)" with empty value
    expect(variantSelect!.options[0].text).toBe('Default (built-in)');
    expect(variantSelect!.options[0].value).toBe('');

    // Second option is the sentinel file
    expect(variantSelect!.options[1].text).toBe(SENTINEL_FILE.basename);
    expect(variantSelect!.options[1].value).toBe(SENTINEL_FILE.path);

    // Change selection to the sentinel file path → session map gets refinePathOverride = path
    variantSelect!.value = SENTINEL_FILE.path;
    variantSelect!.dispatchEvent(new Event('change'));

    expect(sessionMap.get(REFINE_SENTINEL_PATH)?.refinePathOverride).toBe(SENTINEL_FILE.path);

    // Change selection back to Default (empty string) → session map gets refinePathOverride = null
    variantSelect!.value = '';
    variantSelect!.dispatchEvent(new Event('change'));

    expect(sessionMap.get(REFINE_SENTINEL_PATH)?.refinePathOverride).toBeNull();
  });

  // ------------------------------------------------------------------ D0-b (W1 sub-case)
  it('D0-b (W1): settingsActiveRefinePath pre-selects dropdown when no session entry is present', () => {
    // No session entry set — the dropdown should fall back to settingsActiveRefinePath.
    const sessionMap = new OptionsSessionMap();
    const h = createHarnessWithSentinelFromStart(sessionMap, {
      settingsActiveRefinePath: SENTINEL_FILE.path,
    });

    navigateToRefine(h.pressKey);
    h.pressKey('ArrowRight'); // open options panel

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement | null;
    expect(form).not.toBeNull();

    const selects = Array.from(form!.querySelectorAll('select'));
    const variantSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => opt.text === 'Default (built-in)')
    ) as HTMLSelectElement | undefined;
    expect(variantSelect).toBeDefined();

    // No session override → pre-selection must come from settingsActiveRefinePath
    expect(variantSelect!.value).toBe(SENTINEL_FILE.path);
  });

  // ------------------------------------------------------------------ D0-c
  it('D0-c: Reset clears refinePathOverride from session map', () => {
    const sessionMap = new OptionsSessionMap();
    const h = createHarnessWithSentinelFromStart(sessionMap);

    navigateToRefine(h.pressKey);
    h.pressKey('ArrowRight'); // open options panel

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement | null;
    expect(form).not.toBeNull();

    // Locate the variant select and set an override
    const selects = Array.from(form!.querySelectorAll('select'));
    const variantSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => opt.text === 'Default (built-in)')
    ) as HTMLSelectElement | undefined;
    expect(variantSelect).toBeDefined();

    variantSelect!.value = SENTINEL_FILE.path;
    variantSelect!.dispatchEvent(new Event('change'));

    // Confirm override is set in session map
    expect(sessionMap.get(REFINE_SENTINEL_PATH)?.refinePathOverride).toBe(SENTINEL_FILE.path);

    // Click Reset — the entire session entry should be cleared (including refinePathOverride)
    const resetBtn = Array.from(form!.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Reset')
    );
    expect(resetBtn).toBeDefined();
    resetBtn!.dispatchEvent(new Event('click'));

    // After reset, the session entry for REFINE_SENTINEL_PATH must be gone entirely
    expect(sessionMap.get(REFINE_SENTINEL_PATH)).toBeUndefined();
  });

  // ------------------------------------------------------------------ D0-d
  it('D0-d: sentinel-marked file (also spell-tagged) does not appear in the main spell list', () => {
    // The sentinel file has BOTH tags: ['spell'] AND sentinel: 'refine'.
    // Without the isRefineSentinel exclusion in getSpells, it would appear as a spell row.
    // This test pins the getSpells filter from the UI angle.
    const sessionMap = new OptionsSessionMap();
    const h = createHarnessWithSentinelFromStart(sessionMap);

    const spellRows = h.visibleSpellRows();
    const sentinelInList = spellRows.some((row) =>
      row.textContent?.includes(SENTINEL_FILE.basename)
    );
    expect(sentinelInList).toBe(false);
  });
});

describe('RefineVariantSelect — memory cleanup', () => {
  it('destroy() prevents change event from invoking onChange on the detached select', () => {
    const parent = document.createElement('div');
    const onChange = vi.fn();
    const widget = new RefineVariantSelect();

    widget.mount(parent, {
      variants: [{ name: 'My Refine', path: 'spells/my-refine.md' }],
      initialPath: null,
      onChange,
    });

    const select = parent.querySelector<HTMLSelectElement>('select');
    expect(select).not.toBeNull();

    widget.destroy();

    select!.value = 'spells/my-refine.md';
    select!.dispatchEvent(new Event('change'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
