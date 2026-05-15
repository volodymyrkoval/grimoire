import { Scope } from 'obsidian';
import { KeyboardController } from '../KeyboardController';
import { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import { SUPPORTED_MODELS, Effort } from '../../domain/settings/Settings';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import { EffortRow } from '../widgets/EffortRow';
import { buildModelSelect } from '../widgets/ModelSelect';

export interface ForgeSentinelDetailParams {
  contentEl: HTMLElement;
  scope: Scope;
  callbacks: {
    onBack: () => void;
    onSubmit: (snapshot: ForgeFormSnapshot) => void;
  };
  defaults: FormDefaults;
}

/** Detail panel for the Forge sentinel: name/description/model form with its own keyboard bindings. */
export class ForgeSentinelDetail {
  readonly #nameInput: HTMLInputElement;
  readonly #descInput: HTMLTextAreaElement;
  readonly #modelSelect: HTMLSelectElement;
  #effortRow: EffortRow;
  #currentEffort: Effort | null;
  #executeOnNote: boolean = true;
  #kb: KeyboardController;

  constructor({ contentEl, scope, callbacks, defaults }: ForgeSentinelDetailParams) {
    this.#kb = new KeyboardController(scope);
    this.#buildBackButton(contentEl, callbacks.onBack);
    const form = this.#buildForm(contentEl);
    this.#nameInput = this.#buildNameField(form);
    this.#descInput = this.#buildDescriptionField(form);
    this.#buildExecuteOnNoteCheckbox(form);
    this.#buildModelSectionHeader(form);
    this.#modelSelect = this.#buildModelSelect(form, defaults.defaultModel);
    this.#currentEffort = this.#resolveInitialEffort(defaults);
    this.#effortRow = this.#initEffortRow(form, defaults);
    this.#buildSubmitButton(form);
    this.#wireSubmitHandler(form, callbacks.onSubmit);
  }

  /**
   * Release component-owned key bindings on the shared scope.
   * Must be called before the parent re-binds its own keys; otherwise stale
   * ArrowDown/ArrowUp handlers will intercept popup navigation.
   */
  destroy(): void {
    this.#kb.unbindAll();
  }

  #applyModelChange(): void {
    this.#currentEffort = null;
    this.#effortRow.update(this.#modelSelect.value, null);
  }

  #buildForm(contentEl: HTMLElement): HTMLFormElement {
    return contentEl.createEl('form', { cls: 'forge-sentinel-form' });
  }

  #resolveInitialEffort(defaults: FormDefaults): Effort | null {
    const initialModel = SUPPORTED_MODELS.find((m) => m.id === defaults.defaultModel);
    return defaults.defaultEffort ?? (initialModel?.defaultEffort ?? null);
  }

  #initEffortRow(form: HTMLElement, defaults: FormDefaults): EffortRow {
    const effortContainer = form.createDiv();
    const row = new EffortRow();
    row.mount(effortContainer, {
      models: SUPPORTED_MODELS,
      modelId: defaults.defaultModel,
      effort: this.#currentEffort,
      onChange: (effort) => { this.#currentEffort = effort; },
    });
    return row;
  }

  #buildBackButton(contentEl: HTMLElement, onBack: () => void): void {
    const back = contentEl.createEl('button', { text: '← back' });
    back.type = 'button';
    back.addEventListener('click', () => onBack());
  }

  #buildNameField(form: HTMLElement): HTMLInputElement {
    const label = form.createEl('label');
    const input = label.createEl('input');
    input.type = 'text';
    input.placeholder = 'Name';
    input.focus();
    return input;
  }

  #buildDescriptionField(form: HTMLElement): HTMLTextAreaElement {
    const label = form.createEl('label');
    const textarea = label.createEl('textarea');
    textarea.placeholder = 'Description';
    return textarea;
  }

  #buildSubmitButton(form: HTMLFormElement): void {
    const buttonRow = form.createDiv({ cls: 'grimoire-button-row' });
    const submitBtn = buttonRow.createEl('button', { text: 'Submit' });
    submitBtn.type = 'submit';
  }

  #buildModelSectionHeader(form: HTMLElement): void {
    form.createEl('hr');
    form.createEl('small', { text: 'Forging model settings' });
  }

  #buildExecuteOnNoteCheckbox(form: HTMLElement): void {
    const label = form.createEl('label');
    const input = label.createEl('input');
    input.type = 'checkbox';
    input.dataset['grimoire'] = 'execute-on-note';
    input.checked = true;
    input.addEventListener('change', () => { this.#executeOnNote = input.checked; });
    label.append(' Execute on active note');
  }

  #buildModelSelect(form: HTMLElement, defaultModel: string): HTMLSelectElement {
    const label = form.createEl('label');
    return buildModelSelect({
      container: label,
      kb: this.#kb,
      models: SUPPORTED_MODELS,
      initialModel: defaultModel,
      onChange: () => this.#applyModelChange(),
    });
  }

  #wireSubmitHandler(form: HTMLFormElement, onSubmit: (snapshot: ForgeFormSnapshot) => void): void {
    form.onsubmit = (e: Event): void => {
      e.preventDefault();
      onSubmit({
        name: this.#nameInput.value || '',
        description: this.#descInput.value || '',
        model: this.#modelSelect.value,
        effort: this.#currentEffort,
        executeOnNote: this.#executeOnNote,
      });
    };
  }
}
