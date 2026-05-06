import { Scope } from 'obsidian';
import { KeyboardController } from '../KeyboardController';
import { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import { SUPPORTED_MODELS, Effort } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';
import { buildModelSelect } from '../widgets/ModelSelect';
import type { FormDefaults } from '../CommandPopup';

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
  #kb: KeyboardController;

  constructor({ contentEl, scope, callbacks, defaults }: ForgeSentinelDetailParams) {
    this.#kb = new KeyboardController(scope);
    this.#buildBackButton(contentEl, callbacks.onBack);
    const form = this.#buildForm(contentEl);
    this.#nameInput = this.#buildNameField(form);
    this.#descInput = this.#buildDescriptionField(form);
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
    const form = document.createElement('form');
    form.className = 'forge-sentinel-form';
    contentEl.appendChild(form);
    return form;
  }

  #resolveInitialEffort(defaults: FormDefaults): Effort | null {
    const initialModel = SUPPORTED_MODELS.find((m) => m.id === defaults.defaultModel);
    return defaults.defaultEffort ?? (initialModel?.defaultEffort ?? null);
  }

  #initEffortRow(form: HTMLElement, defaults: FormDefaults): EffortRow {
    const effortContainer = document.createElement('div');
    form.appendChild(effortContainer);
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
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '← Back';
    back.addEventListener('click', () => onBack());
    contentEl.appendChild(back);
  }

  #buildNameField(form: HTMLElement): HTMLInputElement {
    const label = document.createElement('label');
    form.appendChild(label);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Name';
    label.appendChild(input);
    input.focus();
    return input;
  }

  #buildDescriptionField(form: HTMLElement): HTMLTextAreaElement {
    const label = document.createElement('label');
    form.appendChild(label);
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Description';
    label.appendChild(textarea);
    return textarea;
  }

  #buildSubmitButton(form: HTMLFormElement): void {
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Submit';
    form.appendChild(submitBtn);
  }

  #buildModelSelect(form: HTMLElement, defaultModel: string): HTMLSelectElement {
    const label = document.createElement('label');
    form.appendChild(label);
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
      });
    };
  }
}
