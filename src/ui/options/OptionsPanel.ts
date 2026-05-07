import type { App, Scope } from 'obsidian';
import { KeyboardController } from '../KeyboardController';
import { SUPPORTED_MODELS } from '../../domain/settings/Settings';
import type { Effort } from '../../domain/settings/Settings';
import { buildModelSelect } from '../widgets/ModelSelect';
import { EffortRow } from '../widgets/EffortRow';
import { ContextNotesInput } from '../widgets/ContextNotesInput';
import type { OptionsFormState, OptionsFormSnapshot } from './OptionsFormState';
import type { OptionsSnapshot } from './OptionsSnapshot';
import { snapshotEqualsCurrent } from './OptionsSnapshot';
import type { OptionsSessionMap } from './OptionsSessionMap';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SpellPath } from '../../domain/spells/SpellPath';

interface ReactiveContext {
  checkboxLabel: HTMLLabelElement;
  checkbox: HTMLInputElement;
  effortContainer: HTMLDivElement;
  effortRow: EffortRow;
  effortRowMountedRef: { value: boolean };
}

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
    const form = this.#buildForm(contentEl);
    const ctx = this.#buildFormControls(form, formState, snapshot, deps);
    this.#unsubscribe = this.#subscribeReactive(formState, snapshot, deps, ctx);
  }

  #buildBackButton(container: HTMLElement, onBack: () => void): void {
    const backBtn = container.createEl('button', { text: '← back' });
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => onBack());
  }

  #buildForm(contentEl: HTMLElement): HTMLFormElement {
    return contentEl.createEl('form', { cls: 'options-panel' });
  }

  #buildFormControls(
    form: HTMLFormElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ): ReactiveContext {
    this.#buildHint(form, 'Context notes');
    this.#buildContextNotes(form, formState, deps.app);
    const textarea = this.#buildTextarea(form, formState);
    const initialExecuteOnNote = formState.snapshot().executeOnNote;
    const eonCheckbox = this.#buildExecuteOnNoteCheckbox(form, formState, initialExecuteOnNote);
    this.#buildCastModelSectionHeader(form);
    const select = buildModelSelect({
      container: form,
      kb: this.#kb,
      models: SUPPORTED_MODELS,
      initialModel: formState.snapshot().model,
      onChange: (id) => formState.setModel(id, SUPPORTED_MODELS),
    });
    const { effortContainer, effortRow, effortRowMountedRef } = this.#buildEffortContainer(form, formState);
    const { checkboxLabel, checkbox } = this.#buildCheckbox(form, formState, snapshot, deps);
    const buttonRow = form.createDiv({ cls: 'grimoire-button-row' });
    this.#buildCastButton(buttonRow, form, formState, deps);
    this.#buildResetButton(buttonRow, snapshot, formState, deps, select, textarea, eonCheckbox, initialExecuteOnNote);
    return { checkboxLabel, checkbox, effortContainer, effortRow, effortRowMountedRef };
  }

  #buildHint(form: HTMLFormElement, text: string): void {
    form.createEl('small', { text });
  }

  #buildCastModelSectionHeader(form: HTMLFormElement): void {
    form.createEl('hr');
    this.#buildHint(form, 'Cast model settings');
  }

  #buildEffortContainer(
    form: HTMLFormElement,
    formState: OptionsFormState,
  ): { effortContainer: HTMLDivElement; effortRow: EffortRow; effortRowMountedRef: { value: boolean } } {
    const effortContainer = form.createDiv();

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
    const contextContainer = form.createDiv();

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
    const textarea = form.createEl('textarea');
    textarea.placeholder = 'Follow-up';
    textarea.value = formState.snapshot().followUp;
    textarea.addEventListener('input', () => {
      formState.setFollowUp(textarea.value);
    });
    return textarea;
  }

  #buildExecuteOnNoteCheckbox(
    form: HTMLFormElement,
    formState: OptionsFormState,
    initialValue: boolean,
  ): HTMLInputElement {
    const container = form.createDiv({ cls: 'grimoire-checkbox-row' });
    const checkbox = container.createEl('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'grimoire-execute-on-note';
    checkbox.dataset['grimoire'] = 'execute-on-note';
    checkbox.checked = initialValue;
    checkbox.addEventListener('change', () => {
      formState.setExecuteOnNote(checkbox.checked);
    });
    const label = container.createEl('label', { text: 'Execute on active note' });
    label.htmlFor = checkbox.id;
    return checkbox;
  }

  #buildCheckbox(
    form: HTMLFormElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ): { checkboxLabel: HTMLLabelElement; checkbox: HTMLInputElement } {
    const checkboxLabel = form.createEl('label');
    checkboxLabel.hide();
    const checkbox = checkboxLabel.createEl('input');
    checkbox.type = 'checkbox';
    checkbox.dataset['grimoire'] = 'set-as-default';
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        const current = formState.snapshot();
        deps.overrides.set(deps.spellPath, { model: current.model, effort: current.effort! });
      } else {
        deps.overrides.clear(deps.spellPath);
      }
      deps.onOverrideChanged();
    });
    checkboxLabel.append('Set as default');
    return { checkboxLabel, checkbox };
  }

  #buildCastButton(
    container: HTMLElement,
    form: HTMLFormElement,
    formState: OptionsFormState,
    deps: OptionsPanelDeps,
  ): void {
    const castBtn = container.createEl('button', { text: 'Cast' });
    castBtn.type = 'submit';

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
    container: HTMLElement,
    snapshot: OptionsSnapshot,
    formState: OptionsFormState,
    deps: OptionsPanelDeps,
    select: HTMLSelectElement,
    textarea: HTMLTextAreaElement,
    eonCheckbox: HTMLInputElement,
    initialExecuteOnNote: boolean,
  ): void {
    const resetBtn = container.createEl('button', { text: 'Reset' });
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => {
      formState.setModel(snapshot.model, SUPPORTED_MODELS);
      if (snapshot.effort !== null) {
        formState.setEffort(snapshot.effort);
      }
      this.#contextNotesInput.clear();
      textarea.value = '';
      formState.setFollowUp('');
      // executeOnNote was captured at panel construction, same as snapshot for model/effort
      formState.setExecuteOnNote(initialExecuteOnNote);
      eonCheckbox.checked = initialExecuteOnNote;
      deps.sessionMap.delete(deps.spellPath);
      // Restore select value explicitly (setModel emits but select needs sync)
      select.value = snapshot.model;
    });
  }

  #subscribeReactive(
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
    { checkboxLabel, checkbox, effortRowMountedRef, effortRow, effortContainer }: ReactiveContext,
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
