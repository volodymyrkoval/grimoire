import { Scope } from 'obsidian';
import { KeyboardController } from '../KeyboardController';

export type ForgeFormData = {
  name: string;
  description: string;
  model: string;
};

interface Callbacks {
  onBack: () => void;
  onSubmit: (data: ForgeFormData) => void;
}

export class ForgeSentinelDetail {
  private readonly nameInput: HTMLInputElement;
  private readonly descInput: HTMLTextAreaElement;
  private readonly modelSelect: HTMLSelectElement;
  #kb: KeyboardController;

  constructor(contentEl: HTMLElement, scope: Scope, callbacks: Callbacks) {
    this.#kb = new KeyboardController(scope);
    this.buildBackButton(contentEl, callbacks.onBack);
    const form = contentEl.createEl('form');
    form.addClass('forge-sentinel-form');
    this.nameInput = this.buildNameField(form);
    this.descInput = this.buildDescriptionField(form);
    this.modelSelect = this.buildModelSelect(form);
    form.createEl('button', { type: 'submit', text: 'Submit' });
    this.wireSubmitHandler(form, callbacks.onSubmit);
    this.bindModelKeys();
  }

  // Unbind component-owned keys when the parent transitions away from this detail.
  // The parent must call destroy() before re-binding its own keys, otherwise stale
  // ArrowDown/ArrowUp bindings on the shared scope will intercept popup keys.
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
    return label.createEl('input', { type: 'text', placeholder: 'Name' }) as HTMLInputElement;
  }

  private buildDescriptionField(form: HTMLElement): HTMLTextAreaElement {
    const label = form.createEl('label');
    return label.createEl('textarea', { placeholder: 'Description' }) as HTMLTextAreaElement;
  }

  private buildModelSelect(form: HTMLElement): HTMLSelectElement {
    const label = form.createEl('label');
    const select = label.createEl('select') as HTMLSelectElement;
    ['haiku', 'sonnet', 'opus'].forEach((model) => {
      select.createEl('option', { value: model, text: model });
    });
    return select;
  }

  private wireSubmitHandler(form: HTMLElement, onSubmit: (data: ForgeFormData) => void): void {
    (form as HTMLFormElement).onsubmit = (e: Event): void => {
      e.preventDefault();
      onSubmit({
        name: this.nameInput.value || '',
        description: this.descInput.value || '',
        model: this.modelSelect.value || 'haiku',
      });
    };
  }
}
