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

// ─── local harness ────────────────────────────────────────────────────────────
// D5 will update the shared harness.ts; until then this file wires the popup
// directly so the test expresses the new 4-arg signature and fails loudly.

const DEFAULT_DEFAULTS: FormDefaults = {
  defaultModel: 'claude-sonnet-4-5',
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

  // New 4-arg constructor introduced by D3 — fails to compile until D3 lands.
  const modal = new CommandPopup(app, 'spell', imprintAction, defaults);
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
    effort?: string;
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
      const selects = form.querySelectorAll('select');
      (selects[0] as HTMLSelectElement).value = values.model;
    }
    if (values.effort !== undefined) {
      // Effort select is the second <select> in the form (added by D2).
      // Empty string '' maps to the (none) option → snapshot.effort === null.
      const selects = form.querySelectorAll('select');
      (selects[1] as HTMLSelectElement).value = values.effort;
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
      defaultModel: 'claude-sonnet-4-5',
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
    const selects = form.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2); // model + effort selects (added by D2)
    const modelSelect = selects[0] as HTMLSelectElement;
    expect(modelSelect.value).toBe(defaults.defaultModel);

    // Effort select is pre-selected to defaults.defaultEffort
    const effortSelect = selects[1] as HTMLSelectElement;
    expect(effortSelect.value).toBe(defaults.defaultEffort);
  });

  it('submitting form invokes imprintAction once with typed snapshot', () => {
    const h = createHarnessWithAction(imprintAction);
    h.navigateToForge();

    h.submitForm({
      name: 'My Spell',
      description: 'Do things',
      model: 'claude-haiku-4-5',
      effort: 'high',
    });

    expect(imprintAction).toHaveBeenCalledOnce();
    expect(imprintAction).toHaveBeenCalledWith({
      name: 'My Spell',
      description: 'Do things',
      model: 'claude-haiku-4-5',
      effort: 'high',
    });
  });

  it('(none) effort option maps to snapshot.effort === null', () => {
    const h = createHarnessWithAction(imprintAction);
    h.navigateToForge();

    // '' is the value of the (none) option; the submit handler maps '' → null
    h.submitForm({
      name: 'Silent Spell',
      description: 'No effort',
      model: 'claude-haiku-4-5',
      effort: '',
    });

    expect(imprintAction).toHaveBeenCalledOnce();
    const snapshot = imprintAction.mock.calls[0][0];
    expect(snapshot.effort).toBeNull();
  });

  it('after submit, popup leaves detail phase and modal stays open', () => {
    const h = createHarnessWithAction(imprintAction);
    h.navigateToForge();

    h.submitForm({ name: 'AnySpell', description: 'desc', model: 'claude-haiku-4-5', effort: '' });

    // Forge form is gone — popup exited detail phase
    expect(h.isInForgeDetail()).toBe(false);

    // Modal's contentEl is still attached — popup was NOT fully closed
    expect(h.contentEl.isConnected).toBe(true);
  });
});
