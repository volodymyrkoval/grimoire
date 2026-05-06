import { Scope } from 'obsidian';
import { KeyboardController } from '../KeyboardController';
import { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import { SUPPORTED_MODELS, Effort } from '../../domain/settings/Settings';
import type { FormDefaults } from '../CommandPopup';

interface Callbacks {
  onBack: () => void;
  onSubmit: (snapshot: ForgeFormSnapshot) => void;
}

/** Detail panel for the Forge sentinel: name/description/model form with its own keyboard bindings. */
export class ForgeSentinelDetail {
  private readonly nameInput: HTMLInputElement;
  private readonly descInput: HTMLTextAreaElement;
  private readonly modelSelect: HTMLSelectElement;
  private readonly effortSelect: HTMLSelectElement;
  #kb: KeyboardController;

  constructor(contentEl: HTMLElement, scope: Scope, callbacks: Callbacks, defaults: FormDefaults) {
    this.#kb = new KeyboardController(scope);
    this.buildBackButton(contentEl, callbacks.onBack);
    const form = contentEl.createEl('form');
    form.addClass('forge-sentinel-form');
    this.nameInput = this.buildNameField(form);
    this.descInput = this.buildDescriptionField(form);
    this.modelSelect = this.buildModelSelect(form);
    this.effortSelect = this.buildEffortSelect(form);
    // Apply defaults
    this.modelSelect.value = defaults.defaultModel;
    this.effortSelect.value = defaults.defaultEffort ?? '';
    form.createEl('button', { type: 'submit', text: 'Submit' });
    this.wireSubmitHandler(form, callbacks.onSubmit);
    this.bindModelKeys();
  }

  /**
   * Release component-owned key bindings on the shared scope.
   * Must be called before the parent re-binds its own keys; otherwise stale
   * ArrowDown/ArrowUp handlers will intercept popup navigation.
   */
  destroy(): void {
    this.#kb.unbindAll();
  }

  private bindModelKeys(): void {
    this.#kb.bind([], 'ArrowDown', () => {
      if (document.activeElement !== this.modelSelect) return false;
      this.modelSelect.selectedIndex =
        (this.modelSelect.selectedIndex + 1) % this.modelSelect.options.length;
      return true;
    });
    this.#kb.bind([], 'ArrowUp', () => {
      if (document.activeElement !== this.modelSelect) return false;
      this.modelSelect.selectedIndex =
        (this.modelSelect.selectedIndex - 1 + this.modelSelect.options.length) %
        this.modelSelect.options.length;
      return true;
    });
  }

  private buildBackButton(contentEl: HTMLElement, onBack: () => void): void {
    const back = contentEl.createEl('button', { text: '← Back' });
    back.onClickEvent(() => onBack());
  }

  private buildNameField(form: HTMLElement): HTMLInputElement {
    const label = form.createEl('label');
    const input = label.createEl('input', { type: 'text', placeholder: 'Name' }) as HTMLInputElement;
    input.focus();
    return input;
  }

  private buildDescriptionField(form: HTMLElement): HTMLTextAreaElement {
    const label = form.createEl('label');
    return label.createEl('textarea', { placeholder: 'Description' }) as HTMLTextAreaElement;
  }

  private buildModelSelect(form: HTMLElement): HTMLSelectElement {
    const label = form.createEl('label');
    const select = label.createEl('select') as HTMLSelectElement;
    SUPPORTED_MODELS.forEach((m) => {
      select.createEl('option', { value: m.id, text: m.label });
    });
    return select;
  }

  private buildEffortSelect(form: HTMLElement): HTMLSelectElement {
    const label = form.createEl('label');
    const select = label.createEl('select') as HTMLSelectElement;
    // (none) option — value '' maps to null on submit
    select.createEl('option', { value: '', text: '(none)' });
    (['low', 'medium', 'high', 'xhigh', 'max'] as Effort[]).forEach((e) => {
      select.createEl('option', { value: e, text: e });
    });
    return select;
  }

  private wireSubmitHandler(form: HTMLElement, onSubmit: (snapshot: ForgeFormSnapshot) => void): void {
    (form as HTMLFormElement).onsubmit = (e: Event): void => {
      e.preventDefault();
      onSubmit({
        name: this.nameInput.value || '',
        description: this.descInput.value || '',
        model: this.modelSelect.value,
        effort: this.effortSelect.value === '' ? null : (this.effortSelect.value as Effort),
      });
    };
  }
}
