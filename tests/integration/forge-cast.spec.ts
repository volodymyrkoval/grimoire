/**
 * Integration test: CommandPopup constructor → ForgeSentinelDetail form → imprintAction callback.
 *
 * Seam: the boundary between CommandPopup (parent) and ForgeSentinelDetail (real child).
 * The imprintAction stub sits at the seam — no CastRunner, ForgeImprinter, or spawn is invoked.
 *
 * RED until D3 (4-arg constructor), D2 (effort field), and D4 (action threading) are implemented.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'obsidian';
import { CommandPopup } from '../../src/ui/CommandPopup';
import type { ImprintAction, FormDefaults } from '../../src/ui/CommandPopup';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { ForgeImprinter } from '../../src/forge/ForgeImprinter';
import { createCaster } from '../../src/cast/createCaster';
import { CastRunner } from '../../src/cast/local/CastRunner';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';
import { modelId } from '../../src/domain/settings/ModelId';

// ─── local harness ────────────────────────────────────────────────────────────
// D5 will update the shared harness.ts; until then this file wires the popup
// directly so the test expresses the new 4-arg signature and fails loudly.

const DEFAULT_DEFAULTS: FormDefaults = {
  defaultModel: modelId('claude-sonnet-4-5'),
  defaultEffort: 'medium',
};

function createHarnessWithAction(
  imprintAction: ImprintAction,
  defaults: FormDefaults = DEFAULT_DEFAULTS,
) {
  const app = new App() as any;
  app.vault.getMarkdownFiles.mockReturnValue([
    { basename: 'Summoning Circle', path: '/spells/summoning.md' },
  ]);
  app.metadataCache.getFileCache.mockReturnValue({
    frontmatter: { tags: ['spell'] },
  });

  const stubOverrides = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });
  const modal = new CommandPopup({ app, spellTag: 'spell', imprintAction, castAction: vi.fn(), defaults, overrides: stubOverrides, sessionMap: new OptionsSessionMap() });
  modal.open();
  const { contentEl } = modal;

  function navigateToForge(): void {
    // SENTINELS = [Forge (index 10), Refine (index 11)] with 10 spell rows.
    // ArrowUp from 0 wraps to 11 (Refine); another ArrowUp → 10 (Forge).
    const scope = (modal as any).scope as {
      dispatch(key: string, modifiers: string[]): boolean;
    };
    scope.dispatch('ArrowUp', []);
    scope.dispatch('ArrowUp', []);
    scope.dispatch('Enter', []);
  }

  function getForm(): HTMLFormElement {
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement | null;
    if (!form) throw new Error('Forge form not found — navigateToForge() must be called first');
    return form;
  }

  function submitForm(values: {
    name?: string;
    description?: string;
    model?: string;
    effort?: string | null;
  }): void {
    const form = getForm();
    if (values.name !== undefined) {
      (form.querySelector('input[type="text"]') as HTMLInputElement).value = values.name;
    }
    if (values.description !== undefined) {
      (form.querySelector('textarea') as HTMLTextAreaElement).value = values.description;
    }
    if (values.model !== undefined) {
      // Model select is the first <select> in the form (populated from SUPPORTED_MODELS).
      const modelSel = form.querySelector('select') as HTMLSelectElement;
      modelSel.value = values.model;
      // Dispatch change so ForgeSentinelDetail updates #currentEffort and effortRow
      modelSel.dispatchEvent(new Event('change'));
    }
    if (values.effort !== undefined && values.effort !== null) {
      // EffortRow renders a SegmentedControl — click the matching button by text content.
      const effortBtns = Array.from(form.querySelectorAll('.grimoire-effort-row .grimoire-segmented__btn'));
      const btn = effortBtns.find((b) => b.textContent === values.effort) as HTMLButtonElement | undefined;
      if (btn) btn.click();
    }
    form.dispatchEvent(new Event('submit'));
  }

  function isInForgeDetail(): boolean {
    return contentEl.querySelector('form.forge-sentinel-form') !== null;
  }

  return { modal, contentEl, navigateToForge, submitForm, getForm, isInForgeDetail };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('forge-cast integration — popup → form → imprintAction', () => {
  let imprintAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    imprintAction = vi.fn();
  });

  it('form pre-selects model and effort from defaults', () => {
    const defaults: FormDefaults = {
      defaultModel: modelId('claude-sonnet-4-5'),
      defaultEffort: 'medium',
    };
    const h = createHarnessWithAction(imprintAction, defaults);
    h.navigateToForge();

    const form = h.getForm();

    // Name input is present
    expect(form.querySelector('input[type="text"]')).toBeTruthy();

    // Description textarea is present
    expect(form.querySelector('textarea')).toBeTruthy();

    // Model select is pre-selected to defaults.defaultModel
    const modelSelect = form.querySelector('select') as HTMLSelectElement;
    expect(modelSelect.value).toBe(defaults.defaultModel);

    // Effort SegmentedControl is present and the default effort button is active
    const effortRow = form.querySelector('.grimoire-effort-row');
    expect(effortRow).toBeTruthy();
    const activeBtn = effortRow!.querySelector('.grimoire-segmented__btn.is-active') as HTMLButtonElement | null;
    expect(activeBtn).toBeTruthy();
    expect(activeBtn!.textContent).toBe(defaults.defaultEffort);
  });

  it('submitting form invokes imprintAction once with typed snapshot', () => {
    const h = createHarnessWithAction(imprintAction);
    h.navigateToForge();

    // Use Sonnet (has effort options: low/medium/high/max)
    h.submitForm({
      name: 'My Spell',
      description: 'Do things',
      model: modelId('claude-sonnet-4-5'),
      effort: 'high',
    });

    expect(imprintAction).toHaveBeenCalledOnce();
    expect(imprintAction).toHaveBeenCalledWith({
      name: 'My Spell',
      description: 'Do things',
      model: modelId('claude-sonnet-4-5'),
      effort: 'high',
      executeOnNote: true,
    });
  });

  it('(none) effort option maps to snapshot.effort === null', () => {
    const h = createHarnessWithAction(imprintAction);
    h.navigateToForge();

    // Haiku has effortOptions: null → no effort UI, effort is always null
    h.submitForm({
      name: 'Silent Spell',
      description: 'No effort',
      model: modelId('claude-haiku-4-5'),
    });

    expect(imprintAction).toHaveBeenCalledOnce();
    const snapshot = imprintAction.mock.calls[0][0];
    expect(snapshot.effort).toBeNull();
  });

  it('after submit, popup leaves detail phase and modal stays open', () => {
    const h = createHarnessWithAction(imprintAction);
    h.navigateToForge();

    h.submitForm({ name: 'AnySpell', description: 'desc', model: 'claude-haiku-4-5' });

    // Forge form is gone — popup exited detail phase
    expect(h.isInForgeDetail()).toBe(false);

    // Modal's contentEl is still attached — popup was NOT fully closed
    expect(h.contentEl.isConnected).toBe(true);
  });

  it('C4 — systemPromptFile flows through CastRunner when real ForgeImprinter wired as imprintAction', () => {
    // This asserts the full popup → form → ForgeImprinter → CastRunner path carries
    // systemPromptFile pointing at the materialized forge.md (not undefined or the old inline prompt).
    const forgePath = '/vault/.obsidian/plugins/grimoire/forge.md';
    const forgeVaultRel = '.obsidian/plugins/grimoire/forge.md';
    const localSettings: GrimoireSettings = {
      vaultMountPath: '/vault',
      spellTag: 'grimoire/spell',
      binaryPath: '/usr/bin/claude',
      cliCommand: 'claude',
      forgeOutputFolder: 'Spells/',
      defaultModel: modelId('claude-sonnet-4-5'),
      defaultEffort: null,
      executionMode: 'local',
      portalHost: '',
      portalPort: '',
      portalPath: '',
      portalAuthUser: '',
      portalAuthPassword: '',
    };

    const runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: () => createCaster(localSettings),
      logWriter: () => ({ recordCasted: vi.fn().mockResolvedValue(undefined), recordError: vi.fn().mockResolvedValue(undefined) }),
      forgeSpellPaths: () => ({ absForCaster: forgePath, vaultRelForPortal: forgeVaultRel }),
    });

    const realImprintAction: ImprintAction = (snapshot) =>
      imprinter.imprint(snapshot, localSettings, vi.fn());

    const h = createHarnessWithAction(realImprintAction);
    h.navigateToForge();
    h.submitForm({ name: 'Flow Spell', description: 'test flow', model: 'claude-sonnet-4-5', effort: 'medium' });

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0];
    expect((runInput as any).systemPromptFile).toBe(forgePath);

    runSpy.mockRestore();
  });
});
