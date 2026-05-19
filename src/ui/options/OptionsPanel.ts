import type { App, Scope } from 'obsidian';
import { KeyboardController } from '../../infra/KeyboardController';
import { ContextNotesInput } from '../widgets/ContextNotesInput';
import type { OptionsFormState, OptionsFormSnapshot } from './OptionsFormState';
import type { OptionsSnapshot } from './OptionsSnapshot';
import type { OptionsSessionMap } from './OptionsSessionMap';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SpellPath } from '../../domain/spells/SpellPath';
import { CastModelSection } from './CastModelSection';
import { RefineVariantSelect } from './RefineVariantSelect';
import type { RefineVariantSelectDeps } from './RefineVariantSelect';

interface EonState {
  checkbox: HTMLInputElement | null;
  initialValue: boolean;
  visible: boolean;
}

export interface OptionsPanelDeps {
  app: App;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  spellPath: SpellPath;
  onCast: (snapshot: OptionsFormSnapshot) => void;
  onOverrideChanged: () => void;
  onBack: () => void;
  showExecuteOnNote?: boolean;
  /** Optional variant selector for the Refine sentinel panel. Omit for spell panels. */
  refineVariantSelectDeps?: RefineVariantSelectDeps;
  /** Called when the user clicks the Forge button to update this spell. Omit for Refine sentinel panels. */
  onForgeUpdate?: () => void;
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
  #refineVariantSelect: RefineVariantSelect | null = null;

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
    this.#refineVariantSelect?.destroy();
  }

  /** Creates the back button that dismisses the detail panel. */
  #buildBackButton(container: HTMLElement): HTMLButtonElement {
    const backBtn = container.createEl('button', { text: '← back' });
    backBtn.type = 'button';
    return backBtn;
  }

  #bindBack(button: HTMLButtonElement, onBack: () => void): void {
    button.addEventListener('click', () => onBack());
  }

  /** Creates and returns the form container element. */
  #buildForm(contentEl: HTMLElement): HTMLFormElement {
    return contentEl.createEl('form', { cls: 'options-panel' });
  }

  /** Populates the form with context notes, follow-up, executeOnNote checkbox, model/effort section, and submit/reset buttons. */
  #buildFormControls(
    form: HTMLFormElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ): void {
    this.#buildHint(form, 'Context notes');
    this.#buildContextNotes(form, formState, deps.app);
    const followUpInput = this.#buildFollowUpInput(form, formState.snapshot().followUp);
    this.#bindFollowUpInput(followUpInput, formState);
    const eonState: EonState = {
      initialValue: formState.snapshot().executeOnNote,
      visible: deps.showExecuteOnNote !== false,
      checkbox: null,
    };
    eonState.checkbox = eonState.visible ? this.#buildExecuteOnNoteCheckbox(form, eonState.initialValue) : null;
    if (eonState.checkbox) {
      this.#bindExecuteOnNote(eonState.checkbox, formState);
    }
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
    this.#bindReset(resetBtn, snapshot, formState, deps, followUpInput, eonState);
    if (deps.refineVariantSelectDeps) {
      this.#refineVariantSelect = new RefineVariantSelect();
      this.#refineVariantSelect.mount(form, deps.refineVariantSelectDeps);
    }
    if (deps.onForgeUpdate) {
      const forgeRow = form.createDiv({ cls: 'grimoire-forge-update-row' });
      const forgeBtn = forgeRow.createEl('button', { text: 'Forge' });
      forgeBtn.type = 'button';
      forgeBtn.addEventListener('click', () => deps.onForgeUpdate?.());
    }
  }

  /** Renders a small hint/label text above form sections. */
  #buildHint(form: HTMLFormElement, text: string): void {
    form.createEl('small', { text });
  }

  /** Mounts the context notes input widget and populates it with any existing session paths. */
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

  #buildFollowUpInput(form: HTMLFormElement, followUp: string): HTMLTextAreaElement {
    const followUpInput = form.createEl('textarea');
    followUpInput.placeholder = 'Follow-up';
    followUpInput.value = followUp;
    return followUpInput;
  }

  #bindFollowUpInput(followUpInput: HTMLTextAreaElement, formState: OptionsFormState): void {
    followUpInput.addEventListener('input', () => {
      formState.setFollowUp(followUpInput.value);
    });
  }

  /** Creates the execute-on-note checkbox with label. */
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

  /** Binds checkbox changes to form state updates. */
  #bindExecuteOnNote(checkbox: HTMLInputElement, formState: OptionsFormState): void {
    checkbox.addEventListener('change', () => {
      formState.setExecuteOnNote(checkbox.checked);
    });
  }

  /** Creates the submit button for casting. */
  #buildCastButton(container: HTMLElement): void {
    const castBtn = container.createEl('button', { text: 'Cast' });
    castBtn.type = 'submit';
  }

  /** Binds form submission to cast action. */
  #bindFormSubmit(form: HTMLFormElement, cast: () => void): void {
    form.onsubmit = (e) => {
      e.preventDefault();
      cast();
    };
  }

  /** Binds Mod+Enter keyboard shortcut to cast action. */
  #bindCastKey(cast: () => void): void {
    this.#kb.bind(['Mod'], 'Enter', () => {
      cast();
      return true;
    });
  }

  /** Creates the reset button that clears form to initial snapshot state. */
  #buildResetButton(container: HTMLElement): HTMLButtonElement {
    const resetBtn = container.createEl('button', { text: 'Reset' });
    resetBtn.type = 'button';
    return resetBtn;
  }

  /** Binds reset button to clear form state to initial snapshot values and session map. */
  #bindReset(
    button: HTMLButtonElement,
    snapshot: OptionsSnapshot,
    formState: OptionsFormState,
    deps: OptionsPanelDeps,
    followUpInput: HTMLTextAreaElement,
    eonState: EonState,
  ): void {
    button.addEventListener('click', () => {
      this.#castModelSection.resetToSnapshot(snapshot, formState);
      this.#contextNotesInput.clear();
      followUpInput.value = '';
      formState.setFollowUp('');
      formState.setExecuteOnNote(eonState.initialValue);
      if (eonState.visible && eonState.checkbox) {
        eonState.checkbox.checked = eonState.initialValue;
      }
      deps.sessionMap.delete(deps.spellPath);
    });
  }
}
