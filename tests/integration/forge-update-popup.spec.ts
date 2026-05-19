/**
 * Integration test: CommandPopup → OptionsPanel → Forge button → ForgeUpdate flow.
 *
 * Seam: the boundary between CommandPopup (parent) and OptionsPanel (real child),
 * specifically the "Forge" button wired by D1-D7. Also covers the
 * CommandPopup → DetailPanelRouter.renderForgeUpdate → ForgeSentinelDetail seam
 * (D0-b, D0-d, D0-e).
 *
 * Spell rows in sorted alphabetical order (harness spells):
 *   index 0 → Banishment Hex       (/spells/banishment.md)
 *   index 1 → Divination Ritual    (/spells/divination.md)
 *   ...
 *   index 10 → Forge  (sentinel)
 *   index 11 → Refine (sentinel)
 *
 * RED phase — fails because:
 *   D0-a: OptionsPanel has no Forge button (D1 not implemented).
 *   D0-b: spellContentReader is not accepted / wired (D6 not implemented).
 *   D0-c: Will pass incidentally (no Forge button anywhere yet), but is written
 *          as a regression guard for when D1 lands.
 *   D0-d: forgeUpdateAction is never called (D6/D7 not implemented).
 *   D0-e: Notice is not posted and forge-sentinel-form may appear (no guard).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from 'obsidian';
import { Notice } from 'obsidian';
import { CommandPopup } from '../../src/ui/CommandPopup';
import type { ImprintAction, CastAction, RefineCastAction } from '../../src/ui/CommandPopup';
import { obsidianRanker } from '../../src/infra/obsidianRanker';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { modelId } from '../../src/domain/settings/ModelId';
import type { SpellContentReader } from '../../src/forge/SpellContentReader';
import type { SpellPath } from '../../src/domain/spells/SpellPath';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_DEFAULTS = {
  defaultModel: modelId('claude-sonnet-4-5'),
  defaultEffort: 'medium' as const,
};

const TEST_FILES = [
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

function makeFakeCastLogPanelDeps() {
  return {
    source: { load: vi.fn().mockResolvedValue([]) },
    refresh: { start: vi.fn(), stop: vi.fn() },
    tick: { start: vi.fn(), stop: vi.fn() },
    now: () => new Date(),
  };
}

interface HarnessOptions {
  spellContentReader?: SpellContentReader;
  forgeUpdateAction?: (spell: unknown, snapshot?: unknown) => void;
}

/**
 * Local harness that wires the new forgeUpdateAction and spellContentReader params
 * directly into CommandPopup. Uses @ts-expect-error for params not yet accepted by
 * the constructor — the compile-time failure IS the red criterion for D6.
 */
function createForgeUpdateHarness(opts: HarnessOptions = {}) {
  const app = new App() as any;
  app.vault.getMarkdownFiles.mockReturnValue(TEST_FILES);
  app.metadataCache.getFileCache.mockReturnValue({
    frontmatter: { tags: ['spell'] },
  });

  const overrides = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  const spellContentReader: SpellContentReader =
    opts.spellContentReader ?? {
      read: vi.fn<(path: SpellPath) => Promise<string>>().mockResolvedValue(
        '@cast tighten the structure\n@cast remove duplication\nsome other content',
      ),
    };

  const forgeUpdateAction = opts.forgeUpdateAction ?? vi.fn();

  const modal = new CommandPopup({
    app,
    spellTag: 'spell',
    rankSpells: obsidianRanker,
    imprintAction: vi.fn() as ImprintAction,
    castAction: vi.fn() as CastAction,
    refineCastAction: vi.fn() as RefineCastAction,
    defaults: DEFAULT_DEFAULTS,
    overrides,
    sessionMap: new OptionsSessionMap(),
    castLogPanelDeps: makeFakeCastLogPanelDeps(),
    forgeUpdateAction,
    spellContentReader,
  });
  modal.open();

  function pressKey(key: string, modifiers: string[] = []): boolean {
    return (modal.scope as any).dispatch(key, modifiers);
  }

  function openOptionsForFirstSpell(): void {
    // selectedIndex starts at 0 (Banishment Hex, alphabetically first)
    pressKey('ArrowRight');
  }

  function openOptionsForRefine(): void {
    // Navigate to Refine sentinel (index 11): 11 ArrowDowns from index 0
    for (let i = 0; i < 11; i++) {
      pressKey('ArrowDown');
    }
    pressKey('ArrowRight');
  }

  function clickForgeButton(): void {
    const forgeRow = modal.contentEl.querySelector('.grimoire-forge-update-row');
    if (!forgeRow) throw new Error('.grimoire-forge-update-row not found in DOM');
    const btn = forgeRow.querySelector('button');
    if (!btn) throw new Error('Forge button not found inside .grimoire-forge-update-row');
    btn.dispatchEvent(new Event('click'));
  }

  return {
    modal,
    contentEl: modal.contentEl,
    pressKey,
    openOptionsForFirstSpell,
    openOptionsForRefine,
    clickForgeButton,
    spellContentReader,
    forgeUpdateAction,
  };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = '';
  Notice.instances.length = 0;
});

// ─── D0-a: Forge button present in options panel for a user-authored spell ───

describe('D0-a: options panel for a user spell includes a Forge button', () => {
  it('ArrowRight on spell row opens options panel with Cast, Reset, and Forge buttons', () => {
    const h = createForgeUpdateHarness();
    h.openOptionsForFirstSpell();

    const optionsForm = h.contentEl.querySelector('form.options-panel');
    expect(optionsForm).not.toBeNull();

    // Cast button must be present (pre-existing)
    const castBtn = Array.from(h.contentEl.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cast',
    );
    expect(castBtn).not.toBeNull();

    // Reset button must be present (pre-existing)
    const resetBtn = Array.from(h.contentEl.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reset',
    );
    expect(resetBtn).not.toBeNull();

    // Forge button must be present inside a grimoire-forge-update-row div (D1 not wired)
    const forgeRow = h.contentEl.querySelector('.grimoire-forge-update-row');
    expect(forgeRow).not.toBeNull();

    const forgeBtn = forgeRow?.querySelector('button');
    expect(forgeBtn).not.toBeNull();
    expect(forgeBtn?.textContent?.trim()).toBe('Forge');
  });
});

// ─── D0-b: Click Forge → spellContentReader called, update-mode dialog mounts ─

describe('D0-b: clicking Forge reads spell content and mounts update-mode dialog', () => {
  it('click Forge → spellContentReader.read called with spell path; dialog is in update mode', async () => {
    const spellContentReader: SpellContentReader = {
      read: vi.fn<(path: SpellPath) => Promise<string>>().mockResolvedValue(
        '@cast do a thing\n@cast another thing',
      ),
    };

    const h = createForgeUpdateHarness({ spellContentReader });
    h.openOptionsForFirstSpell();
    h.clickForgeButton();

    // Allow async spell-content read to resolve
    await vi.waitFor(() => {
      expect(spellContentReader.read).toHaveBeenCalledOnce();
    });

    // read was called with Banishment Hex's path (first spell alphabetically)
    expect(spellContentReader.read).toHaveBeenCalledWith('/spells/banishment.md');

    // Dialog must be mounted in update mode: no <input placeholder="Name"> for name
    const forgeForm = h.contentEl.querySelector('form.forge-sentinel-form');
    expect(forgeForm).not.toBeNull();
    const nameInput = forgeForm?.querySelector('input[placeholder="Name"]');
    expect(nameInput).toBeNull();

    // Description textarea placeholder identifies update mode
    const textarea = forgeForm?.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(textarea?.placeholder).toBe('What should change about this spell?');
  });
});

// ─── D0-c: Refine sentinel options panel has no Forge button ─────────────────

describe('D0-c: Refine sentinel options panel has no Forge button', () => {
  it('ArrowRight on Refine sentinel row does not show a grimoire-forge-update-row', () => {
    const h = createForgeUpdateHarness();
    h.openOptionsForRefine();

    // The Refine options panel opens (sanity check: some form is present)
    // but no forge update row must exist
    const forgeRow = h.contentEl.querySelector('.grimoire-forge-update-row');
    expect(forgeRow).toBeNull();
  });
});

// ─── D0-d: Submitting the update dialog invokes forgeUpdateAction ─────────────

describe('D0-d: submitting the forge-update dialog calls forgeUpdateAction', () => {
  it('submit → forgeUpdateAction invoked once', async () => {
    const forgeUpdateAction = vi.fn();
    const h = createForgeUpdateHarness({ forgeUpdateAction });

    h.openOptionsForFirstSpell();
    h.clickForgeButton();

    // Wait for async read + dialog mount
    await vi.waitFor(() => {
      expect(h.contentEl.querySelector('form.forge-sentinel-form')).not.toBeNull();
    });

    const form = h.contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;

    // Fill in description so submit button is enabled
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Tighten the structure section';
    textarea.dispatchEvent(new Event('input'));

    form.dispatchEvent(new Event('submit'));

    expect(forgeUpdateAction).toHaveBeenCalledOnce();
  });
});

// ─── D0-e: spellContentReader throws → Notice posted, dialog NOT mounted ──────

describe('D0-e: when spellContentReader.read throws, Notice is posted and no forge dialog mounts', () => {
  it('read throws → Notice("Could not read spell content") called; forge-sentinel-form absent', async () => {
    const spellContentReader: SpellContentReader = {
      read: vi.fn<(path: SpellPath) => Promise<string>>().mockRejectedValue(
        new Error('file not found'),
      ),
    };

    const h = createForgeUpdateHarness({ spellContentReader });
    h.openOptionsForFirstSpell();
    h.clickForgeButton();

    // Allow the async read + error path to settle
    await vi.waitFor(() => {
      const noticed = Notice.instances.some(
        (n) => n.message === 'Could not read spell content',
      );
      expect(noticed).toBe(true);
    });

    // No update dialog must be mounted after the error
    expect(h.contentEl.querySelector('form.forge-sentinel-form')).toBeNull();
  });
});
