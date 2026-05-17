/**
 * @vitest-environment happy-dom
 *
 * Unit tests for OptionsPanel per-control wiring.
 * Runs with happy-dom so document.createElement() works.
 */

import { App, Scope } from 'obsidian';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { OptionsPanel } from '../src/ui/options/OptionsPanel';
import { OptionsFormState } from '../src/ui/options/OptionsFormState';
import { OptionsSessionMap } from '../src/ui/options/OptionsSessionMap';
import type { OptionsSnapshot } from '../src/ui/options/OptionsSnapshot';
import { modelId, type ModelId } from '../src/domain/settings/ModelId';
import { SpellOverrideStore } from '../src/domain/settings/SpellOverrideStore';
import { SUPPORTED_MODELS } from '../src/domain/settings/Settings';
import { spellPath } from '../src/domain/spells/SpellPath';

const TEST_SPELL_PATH = spellPath('/spells/test.md');

interface MountResult {
  contentEl: HTMLElement;
  scope: Scope;
  formState: OptionsFormState;
  snapshot: OptionsSnapshot;
  panel: OptionsPanel;
  onCast: ReturnType<typeof vi.fn>;
  onBack: ReturnType<typeof vi.fn>;
}

function mountPanel(overrides?: Partial<{
  model: ModelId;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  showExecuteOnNote: boolean;
}>): MountResult {
  const contentEl = document.createElement('div');
  const scope = new Scope();
  const model = overrides?.model ?? modelId('claude-sonnet-4-5');
  const effort = overrides?.effort !== undefined ? overrides.effort : 'medium';
  const showExecuteOnNote = overrides?.showExecuteOnNote !== false;

  const formState = new OptionsFormState({
    model,
    effort,
    contextNotePaths: [],
    followUp: '',
    executeOnNote: true,
  });

  const snapshot: OptionsSnapshot = { model, effort };

  const sessionMap = new OptionsSessionMap();

  const overridesStore = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  const onCast = vi.fn();
  const onBack = vi.fn();
  const onOverrideChanged = vi.fn();

  const panel = new OptionsPanel(scope);
  panel.render(contentEl, formState, snapshot, {
    app: new App() as any,
    overrides: overridesStore,
    sessionMap,
    spellPath: TEST_SPELL_PATH,
    onCast,
    onOverrideChanged,
    onBack,
    showExecuteOnNote,
  });

  return {
    contentEl,
    scope,
    formState,
    snapshot,
    panel,
    onCast,
    onBack,
  };
}

describe('OptionsPanel — per-control wiring', () => {
  it('model select populated with SUPPORTED_MODELS', () => {
    const { contentEl } = mountPanel();

    const select = contentEl.querySelector<HTMLSelectElement>('select');
    expect(select).not.toBeNull();

    // Select should have one option per SUPPORTED_MODELS entry
    expect(select!.options.length).toBe(SUPPORTED_MODELS.length);

    // Verify each option's value and label
    for (let i = 0; i < SUPPORTED_MODELS.length; i++) {
      const expected = SUPPORTED_MODELS[i];
      const opt = select!.options[i];
      expect(opt.value).toBe(expected.id);
      expect(opt.textContent).toBe(expected.label);
    }
  });

  it('changing model select calls formState.setModel', () => {
    const { contentEl, formState } = mountPanel({
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
    });

    const select = contentEl.querySelector<HTMLSelectElement>('select')!;
    const spy = vi.spyOn(formState, 'setModel');

    // Change to Opus
    select.value = 'claude-opus-4-5';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(modelId('claude-opus-4-5'), SUPPORTED_MODELS);

    spy.mockRestore();
  });

  it('select exists and can be manually navigated by index', () => {
    // Mount with Haiku (index 0) to test wrap-around easily
    const { contentEl } = mountPanel({ model: modelId('claude-haiku-4-5'), effort: null });

    const select = contentEl.querySelector<HTMLSelectElement>('select')!;
    expect(select).not.toBeNull();

    // Verify initial index and options exist
    expect(select.selectedIndex).toBe(0); // Haiku is at index 0
    expect(select.options.length).toBe(SUPPORTED_MODELS.length);

    // Manually navigate (in real usage, this would be driven by ArrowDown/ArrowUp)
    select.selectedIndex = 1;
    expect(select.selectedIndex).toBe(1);

    select.selectedIndex = 2;
    expect(select.selectedIndex).toBe(2);

    // Modulo wrap at boundary
    select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
    expect(select.selectedIndex).toBe(0);
  });

  it('textarea input calls formState.setFollowUp', () => {
    const { contentEl, formState } = mountPanel();

    const textarea = contentEl.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).not.toBeNull();

    const spy = vi.spyOn(formState, 'setFollowUp');

    textarea!.value = 'This is a follow-up';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('This is a follow-up');

    spy.mockRestore();
  });

  it('Back button click calls onBack', () => {
    const { contentEl, onBack } = mountPanel();

    const backBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('back')
    ) as HTMLButtonElement;
    expect(backBtn).not.toBeNull();

    backBtn!.click();

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('destroy() completes without error', () => {
    const { panel } = mountPanel({
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
    });

    expect(() => {
      panel.destroy();
    }).not.toThrow();
  });

  it('form submission calls onCast with current formState snapshot', () => {
    const { contentEl, formState, onCast } = mountPanel();

    const form = contentEl.querySelector<HTMLFormElement>('form');
    expect(form).not.toBeNull();

    const textarea = contentEl.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'my follow-up text';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    form!.dispatchEvent(new Event('submit', { bubbles: true }));

    expect(onCast).toHaveBeenCalledOnce();
    expect(onCast).toHaveBeenCalledWith(
      expect.objectContaining({
        model: modelId('claude-sonnet-4-5'),
        effort: 'medium',
        followUp: 'my follow-up text',
      })
    );
  });

  it('Cmd+Enter keyboard shortcut calls onCast', () => {
    const { scope, onCast } = mountPanel();

    // Dispatch Cmd+Enter via the scope keyboard controller
    (scope as any).dispatch('Enter', ['Mod']);

    expect(onCast).toHaveBeenCalledOnce();
  });

  it('showExecuteOnNote: false hides executeOnNote checkbox', () => {
    const { contentEl } = mountPanel({ showExecuteOnNote: false });

    const executeOnNoteCheckbox = contentEl.querySelector('input[data-grimoire="execute-on-note"]');
    expect(executeOnNoteCheckbox).toBeNull();
  });
});
