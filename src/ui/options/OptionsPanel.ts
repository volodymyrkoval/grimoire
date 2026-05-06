import type { App, Scope } from 'obsidian';
import { KeyboardController } from '../KeyboardController';
import { SUPPORTED_MODELS } from '../../domain/settings/Settings';
import type { Effort } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';
import { ContextNotesInput } from '../widgets/ContextNotesInput';
import type { OptionsFormState, OptionsFormSnapshot } from './OptionsFormState';
import type { OptionsSnapshot } from './OptionsSnapshot';
import { snapshotEqualsCurrent } from './OptionsSnapshot';
import type { OptionsSessionMap } from './OptionsSessionMap';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SpellPath } from '../../domain/spells/SpellPath';

export interface OptionsPanelDeps {
  app: App;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  spellPath: SpellPath;
  onCast: (snapshot: OptionsFormSnapshot) => void;
  onOverrideChanged: () => void;
  onBack: () => void;
}

export class OptionsPanel {
  #kb: KeyboardController;
  #unsubscribe: () => void;
  #contextNotesInput: ContextNotesInput;

  constructor(
    contentEl: HTMLElement,
    scope: Scope,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ) {
    this.#kb = new KeyboardController(scope);
    this.#contextNotesInput = new ContextNotesInput();

    this.#buildBackButton(contentEl, deps.onBack);

    const form = document.createElement('form');
    form.className = 'options-panel';
    contentEl.appendChild(form);
    const select = this.#buildModelSelect(form, formState);
    const { effortContainer, effortRow, effortRowMountedRef } = this.#buildEffortContainer(form, formState);
    this.#buildContextNotes(form, formState, deps.app);
    const textarea = this.#buildTextarea(form, formState);
    const { checkboxLabel, checkbox } = this.#buildCheckbox(form, formState, snapshot, deps);
    this.#buildCastButton(form, formState, deps);
    this.#buildResetButton(form, snapshot, formState, deps, select, textarea);

    this.#unsubscribe = this.#subscribeReactive(
      formState,
      snapshot,
      deps,
      checkboxLabel,
      checkbox,
      effortRowMountedRef,
      effortRow,
      effortContainer,
    );
  }

  #buildBackButton(container: HTMLElement, onBack: () => void): void {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => onBack());
    container.appendChild(backBtn);
  }

  #buildModelSelect(form: HTMLFormElement, formState: OptionsFormState): HTMLSelectElement {
    const select = document.createElement('select');
    for (const m of SUPPORTED_MODELS) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      select.appendChild(opt);
    }
    select.value = formState.snapshot().model;
    select.addEventListener('change', () => {
      formState.setModel(select.value, SUPPORTED_MODELS);
    });
    form.appendChild(select);

    this.#kb.bind([], 'ArrowDown', () => {
      if (document.activeElement !== select) return false;
      select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
      formState.setModel(select.value, SUPPORTED_MODELS);
      return true;
    });
    this.#kb.bind([], 'ArrowUp', () => {
      if (document.activeElement !== select) return false;
      select.selectedIndex =
        (select.selectedIndex - 1 + select.options.length) % select.options.length;
      formState.setModel(select.value, SUPPORTED_MODELS);
      return true;
    });

    return select;
  }

  #buildEffortContainer(
    form: HTMLFormElement,
    formState: OptionsFormState,
  ): { effortContainer: HTMLDivElement; effortRow: EffortRow; effortRowMountedRef: { value: boolean } } {
    const effortContainer = document.createElement('div');
    form.appendChild(effortContainer);

    const snap = formState.snapshot();
    const effortRow = new EffortRow();
    const effortRowMountedRef = {
      value: SUPPORTED_MODELS.find((m) => m.id === snap.model)?.effortOptions !== null,
    };
    effortRow.mount(effortContainer, {
      models: SUPPORTED_MODELS,
      modelId: snap.model,
      effort: snap.effort,
      onChange: (e: Effort) => formState.setEffort(e),
    });

    return { effortContainer, effortRow, effortRowMountedRef };
  }

  #buildContextNotes(form: HTMLFormElement, formState: OptionsFormState, app: App): void {
    const contextContainer = document.createElement('div');
    form.appendChild(contextContainer);

    this.#contextNotesInput.mount(contextContainer, {
      app,
      onChange: (paths) => formState.setContextNotePaths(paths),
    });

    const initialPaths = formState.snapshot().contextNotePaths;
    if (initialPaths.length > 0) {
      this.#contextNotesInput.addPaths(initialPaths);
    }
  }

  #buildTextarea(form: HTMLFormElement, formState: OptionsFormState): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.value = formState.snapshot().followUp;
    textarea.addEventListener('input', () => {
      formState.setFollowUp(textarea.value);
    });
    form.appendChild(textarea);
    return textarea;
  }

  #buildCheckbox(
    form: HTMLFormElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ): { checkboxLabel: HTMLLabelElement; checkbox: HTMLInputElement } {
    const checkboxLabel = document.createElement('label');
    checkboxLabel.style.display = 'none';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        const current = formState.snapshot();
        deps.overrides.set(deps.spellPath, { model: current.model, effort: current.effort! });
      } else {
        deps.overrides.clear(deps.spellPath);
      }
      deps.onOverrideChanged();
    });
    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(document.createTextNode('Set as default'));
    form.appendChild(checkboxLabel);
    return { checkboxLabel, checkbox };
  }

  #buildCastButton(
    form: HTMLFormElement,
    formState: OptionsFormState,
    deps: OptionsPanelDeps,
  ): void {
    const castBtn = document.createElement('button');
    castBtn.type = 'submit';
    castBtn.textContent = 'Cast';
    form.appendChild(castBtn);

    const cast = () => {
      const current = formState.snapshot();
      deps.sessionMap.put(deps.spellPath, current);
      deps.onCast(current);
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      cast();
    };

    this.#kb.bind(['Mod'], 'Enter', () => {
      cast();
      return true;
    });
  }

  #buildResetButton(
    form: HTMLFormElement,
    snapshot: OptionsSnapshot,
    formState: OptionsFormState,
    deps: OptionsPanelDeps,
    select: HTMLSelectElement,
    textarea: HTMLTextAreaElement,
  ): void {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      formState.setModel(snapshot.model, SUPPORTED_MODELS);
      if (snapshot.effort !== null) {
        formState.setEffort(snapshot.effort);
      }
      this.#contextNotesInput.clear();
      textarea.value = '';
      formState.setFollowUp('');
      deps.sessionMap.delete(deps.spellPath);
      // Restore select value explicitly (setModel emits but select needs sync)
      select.value = snapshot.model;
    });
    form.appendChild(resetBtn);
  }

  #subscribeReactive(
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
    checkboxLabel: HTMLLabelElement,
    checkbox: HTMLInputElement,
    effortRowMountedRef: { value: boolean },
    effortRow: EffortRow,
    effortContainer: HTMLDivElement,
  ): () => void {
    const updateReactive = () => {
      const current = formState.snapshot();
      const matches = snapshotEqualsCurrent(snapshot, current);
      const effortPersistable = snapshot.effort !== null;
      checkboxLabel.style.display = !matches && effortPersistable ? '' : 'none';
      checkbox.checked = deps.overrides.has(deps.spellPath);
    };

    const unsubscribe = formState.onChange(() => {
      const current = formState.snapshot();
      if (effortRowMountedRef.value) {
        effortRow.update(current.model, current.effort);
      } else {
        // EffortRow was never mounted (started as Haiku); try mounting now if model gained effort.
        const newModel = SUPPORTED_MODELS.find((m) => m.id === current.model);
        if (newModel?.effortOptions !== null) {
          effortRow.mount(effortContainer, {
            models: SUPPORTED_MODELS,
            modelId: current.model,
            effort: current.effort,
            onChange: (e) => formState.setEffort(e),
          });
          effortRowMountedRef.value = true;
        }
      }
      updateReactive();
    });

    // Initialize display
    updateReactive();

    return unsubscribe;
  }

  destroy(): void {
    this.#kb.unbindAll();
    this.#unsubscribe();
    this.#contextNotesInput.detach();
  }
}
