import type { App, Scope } from 'obsidian';
import { KeyboardController } from '../../infra/KeyboardController';
import { ContextNotesInput } from '../widgets/ContextNotesInput';
import type { OptionsFormState, OptionsFormSnapshot } from './OptionsFormState';
import type { OptionsSnapshot } from './OptionsSnapshot';
import type { OptionsSessionMap } from './OptionsSessionMap';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SpellPath } from '../../domain/spells/SpellPath';
import { CastModelSection } from './CastModelSection';

export interface OptionsPanelDeps {
  app: App;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  spellPath: SpellPath;
  onCast: (snapshot: OptionsFormSnapshot) => void;
  onOverrideChanged: () => void;
  onBack: () => void;
}

/**
 * Panel for spell casting options: context notes, follow-up, executeOnNote toggle,
 * and model/effort selection. Owns sub-components (ContextNotesInput, CastModelSection),
 * a keyboard controller for Mod+Enter to cast, and reset/cast buttons.
 */
export class OptionsPanel {
  #kb: KeyboardController;
  #contextNotesInput: ContextNotesInput;
  #castModelSection: CastModelSection;

  constructor(scope: Scope) {
    this.#kb = new KeyboardController(scope);
    this.#contextNotesInput = new ContextNotesInput();
    this.#castModelSection = new CastModelSection(this.#kb);
  }

  render(
    contentEl: HTMLElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ): void {
    const backBtn = this.#buildBackButton(contentEl);
    this.#bindBack(backBtn, deps.onBack);
    const form = this.#buildForm(contentEl);
    this.#buildFormControls(form, formState, snapshot, deps);
  }

  destroy(): void {
    this.#kb.unbindAll();
    this.#castModelSection.destroy();
    this.#contextNotesInput.detach();
  }

  #buildBackButton(container: HTMLElement): HTMLButtonElement {
    const backBtn = container.createEl('button', { text: '← back' });
    backBtn.type = 'button';
    return backBtn;
  }

  #bindBack(button: HTMLButtonElement, onBack: () => void): void {
    button.addEventListener('click', () => onBack());
  }

  #buildForm(contentEl: HTMLElement): HTMLFormElement {
    return contentEl.createEl('form', { cls: 'options-panel' });
  }

  #buildFormControls(
    form: HTMLFormElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ): void {
    this.#buildHint(form, 'Context notes');
    this.#buildContextNotes(form, formState, deps.app);
    const textarea = this.#buildTextarea(form, formState.snapshot().followUp);
    this.#bindTextarea(textarea, formState);
    const initialExecuteOnNote = formState.snapshot().executeOnNote;
    const eonCheckbox = this.#buildExecuteOnNoteCheckbox(form, initialExecuteOnNote);
    this.#bindExecuteOnNote(eonCheckbox, formState);
    this.#castModelSection.mount(form, formState, snapshot, deps);
    const cast = () => {
      const current = formState.snapshot();
      deps.sessionMap.put(deps.spellPath, current);
      deps.onCast(current);
    };
    const buttonRow = form.createDiv({ cls: 'grimoire-button-row' });
    this.#buildCastButton(buttonRow);
    this.#bindFormSubmit(form, cast);
    this.#bindCastKey(cast);
    const resetBtn = this.#buildResetButton(buttonRow);
    this.#bindReset(resetBtn, snapshot, formState, deps, textarea, eonCheckbox, initialExecuteOnNote);
  }

  #buildHint(form: HTMLFormElement, text: string): void {
    form.createEl('small', { text });
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

  #buildTextarea(form: HTMLFormElement, followUp: string): HTMLTextAreaElement {
    const textarea = form.createEl('textarea');
    textarea.placeholder = 'Follow-up';
    textarea.value = followUp;
    return textarea;
  }

  #bindTextarea(textarea: HTMLTextAreaElement, formState: OptionsFormState): void {
    textarea.addEventListener('input', () => {
      formState.setFollowUp(textarea.value);
    });
  }

  #buildExecuteOnNoteCheckbox(form: HTMLFormElement, initialValue: boolean): HTMLInputElement {
    const container = form.createDiv({ cls: 'grimoire-checkbox-row' });
    const checkbox = container.createEl('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'grimoire-execute-on-note';
    checkbox.dataset['grimoire'] = 'execute-on-note';
    checkbox.checked = initialValue;
    const label = container.createEl('label', { text: 'Execute on active note' });
    label.htmlFor = checkbox.id;
    return checkbox;
  }

  #bindExecuteOnNote(checkbox: HTMLInputElement, formState: OptionsFormState): void {
    checkbox.addEventListener('change', () => {
      formState.setExecuteOnNote(checkbox.checked);
    });
  }

  #buildCastButton(container: HTMLElement): void {
    const castBtn = container.createEl('button', { text: 'Cast' });
    castBtn.type = 'submit';
  }

  #bindFormSubmit(form: HTMLFormElement, cast: () => void): void {
    form.onsubmit = (e) => {
      e.preventDefault();
      cast();
    };
  }

  #bindCastKey(cast: () => void): void {
    this.#kb.bind(['Mod'], 'Enter', () => {
      cast();
      return true;
    });
  }

  #buildResetButton(container: HTMLElement): HTMLButtonElement {
    const resetBtn = container.createEl('button', { text: 'Reset' });
    resetBtn.type = 'button';
    return resetBtn;
  }

  #bindReset(
    button: HTMLButtonElement,
    snapshot: OptionsSnapshot,
    formState: OptionsFormState,
    deps: OptionsPanelDeps,
    textarea: HTMLTextAreaElement,
    eonCheckbox: HTMLInputElement,
    initialExecuteOnNote: boolean,
  ): void {
    button.addEventListener('click', () => {
      this.#castModelSection.resetToSnapshot(snapshot, formState);
      this.#contextNotesInput.clear();
      textarea.value = '';
      formState.setFollowUp('');
      // executeOnNote was captured at panel construction, same as snapshot for model/effort
      formState.setExecuteOnNote(initialExecuteOnNote);
      eonCheckbox.checked = initialExecuteOnNote;
      deps.sessionMap.delete(deps.spellPath);
    });
  }
}
