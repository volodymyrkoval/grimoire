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

  constructor(contentEl: HTMLElement, callbacks: Callbacks) {
    this.buildBackButton(contentEl, callbacks.onBack);
    const form = contentEl.createEl('form');
    form.addClass('forge-sentinel-form');
    this.nameInput = this.buildNameField(form);
    this.descInput = this.buildDescriptionField(form);
    this.modelSelect = this.buildModelSelect(form);
    form.createEl('button', { type: 'submit', text: 'Submit' });
    this.wireSubmitHandler(form, callbacks.onSubmit);
  }

  private buildBackButton(contentEl: HTMLElement, onBack: () => void): void {
    const back = contentEl.createEl('button', { text: '← Back' });
    back.onClickEvent(onBack);
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
