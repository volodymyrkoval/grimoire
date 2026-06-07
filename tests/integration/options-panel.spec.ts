/**
 * Integration test: OptionsPanel — component-seam tests.
 *
 * Seam: the boundary between OptionsPanel (parent) and its real children —
 * ContextNotesInput, EffortRow, model <select>, and the callback surface
 * (onCast, onOverrideChanged, onBack).
 *
 * RED until OptionsPanel is implemented at src/ui/options/OptionsPanel.ts.
 */

import { App, Scope } from 'obsidian';
import { vi, describe, it, expect } from 'vitest';
import { OptionsPanel } from '../../src/ui/options/OptionsPanel';
import { OptionsFormState } from '../../src/ui/options/OptionsFormState';
import { EffortRow } from '../../src/ui/widgets/EffortRow';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { snapshotEqualsCurrent } from '../../src/ui/options/OptionsSnapshot';
import type { OptionsSnapshot } from '../../src/ui/options/OptionsSnapshot';
import { modelId } from '../../src/domain/settings/ModelId';
import { SUPPORTED_MODELS } from '../../src/domain/settings/Settings';
import { spellPath } from '../../src/domain/spells/SpellPath';

// Keep snapshotEqualsCurrent in scope so TypeScript doesn't tree-shake the import,
// and to use it in assertion comments.
void snapshotEqualsCurrent;

const TEST_SPELL_PATH = spellPath('/spells/fireball.md');

interface MountResult {
  contentEl: HTMLElement;
  scope: ReturnType<typeof Scope.prototype.constructor> & InstanceType<typeof Scope>;
  formState: OptionsFormState;
  snapshot: OptionsSnapshot;
  sessionMap: OptionsSessionMap;
  setVaultDefault: ReturnType<typeof vi.fn>;
  onCast: ReturnType<typeof vi.fn>;
  onOverrideChanged: ReturnType<typeof vi.fn>;
  onBack: ReturnType<typeof vi.fn>;
  panel: OptionsPanel;
}

function mountPanel(overrideInitial?: {
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  contextNotePaths?: string[];
  followUp?: string;
  snapshot?: OptionsSnapshot;
  executeOnNote?: boolean;
}): MountResult {
  const model = modelId(overrideInitial?.model ?? 'sonnet');
  const effort = overrideInitial?.effort !== undefined ? overrideInitial.effort : 'medium';

  const contentEl = document.createElement('div');
  const scope = new Scope();
  const formState = new OptionsFormState({
    model,
    effort,
    contextNotePaths: overrideInitial?.contextNotePaths ?? [],
    followUp: overrideInitial?.followUp ?? '',
    executeOnNote: overrideInitial?.executeOnNote ?? true,
  });

  const snapshot: OptionsSnapshot = overrideInitial?.snapshot ?? { model, effort };

  const sessionMap = new OptionsSessionMap();

  const writeCasting = vi.fn().mockResolvedValue(undefined);
  const reader = vi.fn().mockReturnValue(null);
  const setVaultDefault = vi.fn();
  const onCast = vi.fn();
  const onOverrideChanged = vi.fn();
  const onBack = vi.fn();

  const app = new App() as any;

  const panel = new OptionsPanel(scope);
  panel.render(contentEl, formState, snapshot, {
    app,
    sessionMap,
    spellPath: TEST_SPELL_PATH,
    onCast,
    onOverrideChanged,
    onBack,
    writeCasting,
    reader,
    setVaultDefault,
  });

  return {
    contentEl,
    scope: scope as any,
    formState,
    snapshot,
    sessionMap,
    setVaultDefault,
    onCast,
    onOverrideChanged,
    onBack,
    panel,
  };
}

describe('OptionsPanel integration', () => {
  // ------------------------------------------------------------------ A1
  it('renders all expected controls inside form.options-panel', () => {
    const { contentEl } = mountPanel();

    const form = contentEl.querySelector('form.options-panel');
    expect(form).not.toBeNull();

    // Model <select>
    expect(form!.querySelector('select')).not.toBeNull();

    // ContextNotesInput search input
    expect(form!.querySelector('input.context-notes-search')).not.toBeNull();

    // Follow-up textarea
    expect(form!.querySelector('textarea')).not.toBeNull();

    // Cast submit button
    const castBtn = Array.from(form!.querySelectorAll('button[type="submit"]')).find(
      (b) => b.textContent?.trim() === 'Cast'
    );
    expect(castBtn).not.toBeNull();

    // Reset button
    const resetBtn = Array.from(form!.querySelectorAll('button[type="button"]')).find(
      (b) => b.textContent?.trim() === 'Reset'
    );
    expect(resetBtn).not.toBeNull();

    // "Set as default" label is hidden: snapshot matches initial formState
    // (model: sonnet, effort: medium) — snapshotEqualsCurrent returns true
    const defaultLabel = form!.querySelector<HTMLElement>('label:has(input[type="checkbox"])');
    expect(defaultLabel).not.toBeNull();
    expect(defaultLabel!.style.display).toBe('none');

    // "Execute on active note" checkbox
    const eonCheckbox = form!.querySelector('input[type="checkbox"][data-grimoire="execute-on-note"]');
    expect(eonCheckbox).not.toBeNull();
  });

  // ------------------------------------------------------------------ A2
  it('changing model to Opus makes the "Set as default" checkbox label visible', () => {
    const { contentEl, formState } = mountPanel({
      model: modelId('sonnet'),
      effort: 'medium',
    });

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Change model to Opus
    select.value = 'opus';
    select.dispatchEvent(new Event('change'));

    // formState now has model=opus, snapshot has model=sonnet → not equal
    // Opus has effortOptions (non-null) → effortPersistable = true
    // → label should be visible
    const defaultLabel = form.querySelector<HTMLElement>('label:has(input[type="checkbox"])');
    expect(defaultLabel).not.toBeNull();
    expect(defaultLabel!.style.display).not.toBe('none');
  });

  // ------------------------------------------------------------------ A3
  it('Reset restores snapshot values, hides the checkbox label, and calls sessionMap.delete', () => {
    const { contentEl, sessionMap } = mountPanel({
      model: modelId('sonnet'),
      effort: 'medium',
      snapshot: { model: modelId('sonnet'), effort: 'medium' },
    });

    const deleteSpy = vi.spyOn(sessionMap, 'delete');

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // First change model to make things differ
    select.value = 'opus';
    select.dispatchEvent(new Event('change'));

    // Verify label is visible after change
    const defaultLabel = form.querySelector<HTMLElement>('label:has(input[type="checkbox"])');
    expect(defaultLabel!.style.display).not.toBe('none');

    // Click Reset
    const resetBtn = Array.from(form.querySelectorAll('button[type="button"]')).find(
      (b) => b.textContent?.trim() === 'Reset'
    ) as HTMLButtonElement;
    resetBtn.click();

    // Model select restored to snapshot value
    expect(select.value).toBe('sonnet');

    // Checkbox label hidden again
    expect(defaultLabel!.style.display).toBe('none');

    // sessionMap.delete called with spellPath
    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledWith(TEST_SPELL_PATH);
  });

  // ------------------------------------------------------------------ A4
  it('Cast calls onCast with the typed follow-up; session is saved with follow-up cleared', () => {
    const { contentEl, sessionMap, onCast } = mountPanel();

    const putSpy = vi.spyOn(sessionMap, 'put');

    const form = contentEl.querySelector('form.options-panel')!;
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea')!;

    textarea.value = 'my followup';
    textarea.dispatchEvent(new Event('input'));

    form.dispatchEvent(new Event('submit'));

    // onCast receives the user's follow-up text
    expect(onCast).toHaveBeenCalledOnce();
    expect(onCast).toHaveBeenCalledWith(
      expect.objectContaining({
        model: modelId('sonnet'),
        effort: 'medium',
        followUp: 'my followup',
        contextNotePaths: [],
      })
    );

    // session is saved with follow-up cleared so next open starts fresh
    expect(putSpy).toHaveBeenCalledOnce();
    expect(putSpy).toHaveBeenCalledWith(
      TEST_SPELL_PATH,
      expect.objectContaining({
        model: modelId('sonnet'),
        effort: 'medium',
        followUp: '',
        contextNotePaths: [],
      })
    );
  });

  // ------------------------------------------------------------------ A5
  it('checking "Set as default" calls setVaultDefault with model and effort, then onOverrideChanged', () => {
    const { contentEl, setVaultDefault, onOverrideChanged } = mountPanel({
      model: modelId('sonnet'),
      effort: 'medium',
    });

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Make checkbox visible by changing model
    select.value = 'opus';
    select.dispatchEvent(new Event('change'));

    const checkbox = form.querySelector<HTMLInputElement>('input[data-grimoire="set-as-default"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    // After F2: checking "Set as default" calls setVaultDefault(model, effort)
    expect(setVaultDefault).toHaveBeenCalledOnce();
    expect(setVaultDefault).toHaveBeenCalledWith(modelId('opus'), 'medium');
    expect(onOverrideChanged).toHaveBeenCalledOnce();
  });

  // ------------------------------------------------------------------ A6
  it('unchecking "Set as default" is a no-op (vault-wide default cannot be unset per-spell), but calls onOverrideChanged for refresh', () => {
    const { contentEl, setVaultDefault, onOverrideChanged } = mountPanel({
      model: modelId('sonnet'),
      effort: 'medium',
    });

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Make checkbox visible
    select.value = 'opus';
    select.dispatchEvent(new Event('change'));

    // Check then uncheck
    const checkbox = form.querySelector<HTMLInputElement>('input[data-grimoire="set-as-default"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    onOverrideChanged.mockClear();
    setVaultDefault.mockClear();

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    // Unchecking is a no-op: vault-wide default cannot be unset per-spell
    expect(setVaultDefault).not.toHaveBeenCalled();
    // But onOverrideChanged is called to trigger a refresh
    expect(onOverrideChanged).toHaveBeenCalledOnce();
  });

  // ------------------------------------------------------------------ A7
  it('Haiku model: effort row absent; checkbox stays hidden even when model differs from snapshot', () => {
    const { contentEl, formState } = mountPanel({
      model: modelId('haiku'),
      effort: null,
      snapshot: { model: modelId('haiku'), effort: null },
    });

    const form = contentEl.querySelector('form.options-panel')!;

    // No effort row for Haiku
    expect(form.querySelector('.grimoire-effort-row')).toBeNull();

    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Change model to Sonnet — formState differs from snapshot (haiku → sonnet).
    // effortPersistable tracks the *current* model's effort support, not the snapshot's.
    // Sonnet supports effort, so after the switch effortPersistable becomes true and the
    // snapshot no longer equals current → the "Set as default" checkbox should become visible.
    select.value = 'sonnet';
    select.dispatchEvent(new Event('change'));

    // Checkbox is now visible: current model (Sonnet) supports effort and form differs from snapshot
    const defaultLabel = form.querySelector<HTMLElement>('label:has(input[type="checkbox"])');
    expect(defaultLabel).not.toBeNull();
    expect(defaultLabel!.style.display).not.toBe('none');

    // formState has been mutated by setModel call — Sonnet should have an effort row now
    // (EffortRow lazy-mounts when model gains effortOptions)
    expect(form.querySelector('.grimoire-effort-row')).not.toBeNull();
  });

  // ------------------------------------------------------------------ A8
  it('Mod+Enter fires Cast (scope keyboard shortcut)', () => {
    const { contentEl, scope, onCast } = mountPanel();

    const form = contentEl.querySelector('form.options-panel')!;
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'keyboard cast';
    textarea.dispatchEvent(new Event('input'));

    (scope as any).dispatch('Enter', ['Mod']);

    expect(onCast).toHaveBeenCalledOnce();
  });

  // ------------------------------------------------------------------ A10
  it('ArrowDown on focused model select updates formState and calls EffortRow.update with new model', () => {
    const updateSpy = vi.spyOn(EffortRow.prototype, 'update');
    const { contentEl, scope, formState } = mountPanel();
    document.body.appendChild(contentEl);

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;
    // Default is sonnet (index 1); ArrowDown moves to opus (index 2)
    select.focus();

    (scope as any).dispatch('ArrowDown', []);

    // effort survives when new model also has the current effort in its options
    expect(updateSpy).toHaveBeenCalledWith('opus', expect.anything());
    expect(formState.snapshot().model).toBe('opus');
    document.body.removeChild(contentEl);
    updateSpy.mockRestore();
  });

  // ------------------------------------------------------------------ A11
  it('ArrowUp on focused model select updates formState and calls EffortRow.update with new model', () => {
    const updateSpy = vi.spyOn(EffortRow.prototype, 'update');
    const { contentEl, scope, formState } = mountPanel();
    document.body.appendChild(contentEl);

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;
    // Default is sonnet (index 1); ArrowUp moves to haiku (index 0)
    select.focus();

    (scope as any).dispatch('ArrowUp', []);

    // haiku has null effort (no effort options)
    expect(updateSpy).toHaveBeenCalledWith('haiku', null);
    expect(formState.snapshot().model).toBe('haiku');
    document.body.removeChild(contentEl);
    updateSpy.mockRestore();
  });

  // ------------------------------------------------------------------ B1
  it('executeOnNote checkbox starts checked when mountPanel receives executeOnNote: true', () => {
    const { contentEl } = mountPanel({ executeOnNote: true });

    const form = contentEl.querySelector('form.options-panel')!;
    const eonCheckbox = form.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-grimoire="execute-on-note"]'
    );

    expect(eonCheckbox).not.toBeNull();
    expect(eonCheckbox!.checked).toBe(true);
  });

  // ------------------------------------------------------------------ B2
  it('executeOnNote checkbox starts unchecked when mountPanel receives executeOnNote: false', () => {
    const { contentEl } = mountPanel({ executeOnNote: false });

    const form = contentEl.querySelector('form.options-panel')!;
    const eonCheckbox = form.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-grimoire="execute-on-note"]'
    );

    expect(eonCheckbox).not.toBeNull();
    expect(eonCheckbox!.checked).toBe(false);
  });

  // ------------------------------------------------------------------ B3
  it('unchecking executeOnNote flips formState and Cast emits executeOnNote: false', () => {
    const { contentEl, formState, onCast } = mountPanel({ executeOnNote: true });

    const form = contentEl.querySelector('form.options-panel')!;
    const eonCheckbox = form.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-grimoire="execute-on-note"]'
    )!;

    // Uncheck the box
    eonCheckbox.checked = false;
    eonCheckbox.dispatchEvent(new Event('change'));

    expect(formState.snapshot().executeOnNote).toBe(false);

    form.dispatchEvent(new Event('submit'));

    expect(onCast).toHaveBeenCalledOnce();
    expect(onCast).toHaveBeenCalledWith(
      expect.objectContaining({ executeOnNote: false })
    );
  });

  // ------------------------------------------------------------------ B4
  it('Reset restores executeOnNote checkbox to the seeded value', () => {
    const { contentEl, formState } = mountPanel({ executeOnNote: true });

    const form = contentEl.querySelector('form.options-panel')!;
    const eonCheckbox = form.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-grimoire="execute-on-note"]'
    )!;

    // Uncheck the box to drift away from the seeded value
    eonCheckbox.checked = false;
    eonCheckbox.dispatchEvent(new Event('change'));

    expect(formState.snapshot().executeOnNote).toBe(false);

    // Click Reset
    const resetBtn = Array.from(form.querySelectorAll('button[type="button"]')).find(
      (b) => b.textContent?.trim() === 'Reset'
    ) as HTMLButtonElement;
    resetBtn.click();

    expect(formState.snapshot().executeOnNote).toBe(true);
    expect(eonCheckbox.checked).toBe(true);
  });

  // ------------------------------------------------------------------ B-D6
  it('executeOnNote inner input fires formState.setExecuteOnNote on a raw change event (D6 contract)', () => {
    const { contentEl, formState } = mountPanel({ executeOnNote: false });
    const form = contentEl.querySelector('form.options-panel')!;
    const eonCheckbox = form.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-grimoire="execute-on-note"]'
    )!;
    expect(eonCheckbox).not.toBeNull();

    eonCheckbox.checked = true;
    eonCheckbox.dispatchEvent(new Event('change'));

    expect(formState.snapshot().executeOnNote).toBe(true);
  });

  // ------------------------------------------------------------------ A9
  it('panel.destroy() removes the formState listener so mutations no longer update the DOM', () => {
    const { contentEl, panel, formState, scope, onCast } = mountPanel({
      model: modelId('sonnet'),
      effort: 'medium',
      snapshot: { model: modelId('sonnet'), effort: 'medium' },
    });

    const form = contentEl.querySelector('form.options-panel')!;
    const defaultLabel = form.querySelector<HTMLElement>('label:has(input[type="checkbox"])')!;

    // Confirm label starts hidden (snapshot equals formState)
    expect(defaultLabel.style.display).toBe('none');

    panel.destroy();

    // After destroy, mutate formState — the listener should be gone
    formState.setModel(modelId('opus'), SUPPORTED_MODELS);

    // DOM should NOT have updated — label stays hidden because no re-render happened
    expect(defaultLabel.style.display).toBe('none');

    // Mod+Enter after destroy must NOT call onCast
    ;(scope as any).dispatch('Enter', ['Mod']);
    expect(onCast).not.toHaveBeenCalled();
  });
});
