import { Scope } from 'obsidian';
import { KeyboardController } from '../KeyboardController';
import { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import { SUPPORTED_MODELS, Effort } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';
import type { FormDefaults } from '../CommandPopup';

interface Callbacks {
  onBack: () => void;
  onSubmit: (snapshot: ForgeFormSnapshot) => void;
}

/** Detail panel for the Forge sentinel: name/description/model form with its own keyboard bindings. */
export class ForgeSentinelDetail {
  readonly #nameInput: HTMLInputElement;
  readonly #descInput: HTMLTextAreaElement;
  readonly #modelSelect: HTMLSelectElement;
  #effortRow: EffortRow;
  #currentEffort: Effort | null;
  #kb: KeyboardController;

  constructor(contentEl: HTMLElement, scope: Scope, callbacks: Callbacks, defaults: FormDefaults) {
    this.#kb = new KeyboardController(scope);
    this.#buildBackButton(contentEl, callbacks.onBack);
    const form = this.#buildForm(contentEl);
    this.#nameInput = this.#buildNameField(form);
    this.#descInput = this.#buildDescriptionField(form);
    this.#modelSelect = this.#buildModelSelect(form);
    this.#initModelSelect(defaults.defaultModel);
    this.#currentEffort = this.#resolveInitialEffort(defaults);
    this.#effortRow = this.#initEffortRow(form, defaults);
    this.#wireModelChangeListener();
    form.createEl('button', { type: 'submit', text: 'Submit' });
    this.#wireSubmitHandler(form, callbacks.onSubmit);
    this.#bindModelKeys();
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

  #bindModelKeys(): void {
    this.#kb.bind([], 'ArrowDown', () => {
      if (document.activeElement !== this.#modelSelect) return false;
      this.#modelSelect.selectedIndex =
        (this.#modelSelect.selectedIndex + 1) % this.#modelSelect.options.length;
      this.#applyModelChange();
      return true;
    });
    this.#kb.bind([], 'ArrowUp', () => {
      if (document.activeElement !== this.#modelSelect) return false;
      this.#modelSelect.selectedIndex =
        (this.#modelSelect.selectedIndex - 1 + this.#modelSelect.options.length) %
        this.#modelSelect.options.length;
      this.#applyModelChange();
      return true;
    });
  }

  #buildForm(contentEl: HTMLElement): HTMLElement {
    const form = contentEl.createEl('form');
    form.addClass('forge-sentinel-form');
    return form;
  }

  #initModelSelect(defaultModel: string): void {
    this.#modelSelect.value = defaultModel;
  }

  #resolveInitialEffort(defaults: FormDefaults): Effort | null {
    const initialModel = SUPPORTED_MODELS.find((m) => m.id === defaults.defaultModel);
    return defaults.defaultEffort ?? (initialModel?.defaultEffort ?? null);
  }

  #initEffortRow(form: HTMLElement, defaults: FormDefaults): EffortRow {
    const effortContainer = form.createEl('div');
    const row = new EffortRow();
    row.mount(effortContainer, {
      models: SUPPORTED_MODELS,
      modelId: defaults.defaultModel,
      effort: this.#currentEffort,
      onChange: (effort) => { this.#currentEffort = effort; },
    });
    return row;
  }

  #wireModelChangeListener(): void {
    this.#modelSelect.addEventListener('change', () => this.#applyModelChange());
  }

  #buildBackButton(contentEl: HTMLElement, onBack: () => void): void {
    const back = contentEl.createEl('button', { text: '← Back' });
    back.onClickEvent(() => onBack());
  }

  #buildNameField(form: HTMLElement): HTMLInputElement {
    const label = form.createEl('label');
    const input = label.createEl('input', { type: 'text', placeholder: 'Name' }) as HTMLInputElement;
    input.focus();
    return input;
  }

  #buildDescriptionField(form: HTMLElement): HTMLTextAreaElement {
    const label = form.createEl('label');
    return label.createEl('textarea', { placeholder: 'Description' }) as HTMLTextAreaElement;
  }

  #buildModelSelect(form: HTMLElement): HTMLSelectElement {
    const label = form.createEl('label');
    const select = label.createEl('select') as HTMLSelectElement;
    SUPPORTED_MODELS.forEach((m) => {
      select.createEl('option', { value: m.id, text: m.label });
    });
    return select;
  }

  #wireSubmitHandler(form: HTMLElement, onSubmit: (snapshot: ForgeFormSnapshot) => void): void {
    (form as HTMLFormElement).onsubmit = (e: Event): void => {
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
