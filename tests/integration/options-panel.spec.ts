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
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { OptionsPanel } from '../../src/ui/options/OptionsPanel';
import { OptionsFormState } from '../../src/ui/options/OptionsFormState';
import { EffortRow } from '../../src/ui/widgets/EffortRow';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { snapshotEqualsCurrent } from '../../src/ui/options/OptionsSnapshot';
import type { OptionsSnapshot } from '../../src/ui/options/OptionsSnapshot';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
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
  overrides: SpellOverrideStore;
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
  const model = overrideInitial?.model ?? 'claude-sonnet-4-5';
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

  const overrides = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  const onCast = vi.fn();
  const onOverrideChanged = vi.fn();
  const onBack = vi.fn();

  const app = new App() as any;

  const panel = new OptionsPanel(contentEl, scope, formState, snapshot, {
    app,
    overrides,
    sessionMap,
    spellPath: TEST_SPELL_PATH,
    onCast,
    onOverrideChanged,
    onBack,
  });

  return {
    contentEl,
    scope: scope as any,
    formState,
    snapshot,
    sessionMap,
    overrides,
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
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Change model to Opus
    select.value = 'claude-opus-4-5';
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
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      snapshot: { model: 'claude-sonnet-4-5', effort: 'medium' },
    });

    const deleteSpy = vi.spyOn(sessionMap, 'delete');

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // First change model to make things differ
    select.value = 'claude-opus-4-5';
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
    expect(select.value).toBe('claude-sonnet-4-5');

    // Checkbox label hidden again
    expect(defaultLabel!.style.display).toBe('none');

    // sessionMap.delete called with spellPath
    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledWith(TEST_SPELL_PATH);
  });

  // ------------------------------------------------------------------ A4
  it('Cast stores session via sessionMap.put and calls onCast with current formState snapshot', () => {
    const { contentEl, sessionMap, onCast } = mountPanel();

    const putSpy = vi.spyOn(sessionMap, 'put');

    const form = contentEl.querySelector('form.options-panel')!;
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea')!;

    textarea.value = 'my followup';
    textarea.dispatchEvent(new Event('input'));

    form.dispatchEvent(new Event('submit'));

    expect(onCast).toHaveBeenCalledOnce();
    expect(onCast).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        followUp: 'my followup',
        contextNotePaths: [],
      })
    );

    expect(putSpy).toHaveBeenCalledOnce();
    expect(putSpy).toHaveBeenCalledWith(
      TEST_SPELL_PATH,
      expect.objectContaining({
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        followUp: 'my followup',
        contextNotePaths: [],
      })
    );
  });

  // ------------------------------------------------------------------ A5
  it('checking "Set as default" calls overrides.set and onOverrideChanged', () => {
    const { contentEl, overrides, onOverrideChanged } = mountPanel({
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });

    const setSpy = vi.spyOn(overrides, 'set');

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Make checkbox visible by changing model
    select.value = 'claude-opus-4-5';
    select.dispatchEvent(new Event('change'));

    const checkbox = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(setSpy).toHaveBeenCalledOnce();
    expect(onOverrideChanged).toHaveBeenCalledOnce();
  });

  // ------------------------------------------------------------------ A6
  it('unchecking "Set as default" calls overrides.clear and onOverrideChanged', () => {
    const { contentEl, overrides, onOverrideChanged } = mountPanel({
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });

    const clearSpy = vi.spyOn(overrides, 'clear');

    const form = contentEl.querySelector('form.options-panel')!;
    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Make checkbox visible
    select.value = 'claude-opus-4-5';
    select.dispatchEvent(new Event('change'));

    // Check then uncheck
    const checkbox = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    onOverrideChanged.mockClear();

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(clearSpy).toHaveBeenCalledWith(TEST_SPELL_PATH);
    expect(onOverrideChanged).toHaveBeenCalledOnce();
  });

  // ------------------------------------------------------------------ A7
  it('Haiku model: effort row absent; checkbox stays hidden even when model differs from snapshot', () => {
    const { contentEl, formState } = mountPanel({
      model: 'claude-haiku-4-5',
      effort: null,
      snapshot: { model: 'claude-haiku-4-5', effort: null },
    });

    const form = contentEl.querySelector('form.options-panel')!;

    // No effort row for Haiku
    expect(form.querySelector('.grimoire-effort-row')).toBeNull();

    const select = form.querySelector<HTMLSelectElement>('select')!;

    // Change model to Sonnet — formState differs from snapshot (haiku → sonnet)
    // but effort becomes non-null — wait: formState started as Haiku, Sonnet has effort
    // The OptionsPanel should detect: effort is now non-null after the change
    // BUT the snapshot.model=haiku vs formState.model=sonnet → snapshotEqualsCurrent = false
    // However: the plan spec says checkbox is hidden when effort === null OR snapshotEqualsCurrent.
    // Haiku itself has null effort; when switching TO Sonnet effort becomes 'medium'.
    // So this assertion is specifically: when starting from Haiku and changing to Sonnet,
    // the effort row appears BUT — re-reading the spec:
    // A7 says: "change model select to 'claude-sonnet-4-5'" → effort is now non-null for Sonnet
    // BUT spec says checkbox hidden when "effort === null". After switching to Sonnet effort != null.
    // Re-read spec assertion 7: "checkbox still hidden" because effortPersistable=false.
    // The spec means: effortPersistable tracks whether the *original* Haiku form had null effort.
    // Actually the spec says: checkbox hidden when snapshotEqualsCurrent OR effort===null.
    // After switching from Haiku snapshot to Sonnet form: snapshotEqualsCurrent=false, effort='medium'.
    // So checkbox SHOULD be visible — but spec says hidden. The spec must mean:
    // when snapshot itself has effort=null, override cannot be persisted (effortPersistable=false).
    // So the rule is: checkbox hidden when snapshotEqualsCurrent OR snapshot.effort===null.
    // Let's assert what the spec says: checkbox label display === 'none' after model change.
    select.value = 'claude-sonnet-4-5';
    select.dispatchEvent(new Event('change'));

    // Per spec: checkbox still hidden because snapshot.effort === null (Haiku base → not persistable)
    const defaultLabel = form.querySelector<HTMLElement>('label:has(input[type="checkbox"])');
    expect(defaultLabel).not.toBeNull();
    expect(defaultLabel!.style.display).toBe('none');

    // formState has been mutated by setModel call — Sonnet should have an effort row now
    // (EffortRow lazy-mounts when model gains effortOptions)
    expect(form.querySelector('.grimoire-effort-row')).not.toBeNull();
  });

  // ------------------------------------------------------------------ A8
  it('Cmd+Enter fires Cast (scope keyboard shortcut)', () => {
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
    expect(updateSpy).toHaveBeenCalledWith('claude-opus-4-5', expect.anything());
    expect(formState.snapshot().model).toBe('claude-opus-4-5');
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
    expect(updateSpy).toHaveBeenCalledWith('claude-haiku-4-5', null);
    expect(formState.snapshot().model).toBe('claude-haiku-4-5');
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

  // ------------------------------------------------------------------ A9
  it('panel.destroy() removes the formState listener so mutations no longer update the DOM', () => {
    const { contentEl, panel, formState, scope, onCast } = mountPanel({
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      snapshot: { model: 'claude-sonnet-4-5', effort: 'medium' },
    });

    const form = contentEl.querySelector('form.options-panel')!;
    const defaultLabel = form.querySelector<HTMLElement>('label:has(input[type="checkbox"])')!;

    // Confirm label starts hidden (snapshot equals formState)
    expect(defaultLabel.style.display).toBe('none');

    panel.destroy();

    // After destroy, mutate formState — the listener should be gone
    formState.setModel('claude-opus-4-5', SUPPORTED_MODELS);

    // DOM should NOT have updated — label stays hidden because no re-render happened
    expect(defaultLabel.style.display).toBe('none');

    // Mod+Enter after destroy must NOT call onCast
    ;(scope as any).dispatch('Enter', ['Mod']);
    expect(onCast).not.toHaveBeenCalled();
  });
});
