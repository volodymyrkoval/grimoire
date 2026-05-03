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
  constructor(contentEl: HTMLElement, callbacks: Callbacks) {
    // Back button
    const back = contentEl.createEl('button', { text: '← Back' });
    back.onClickEvent(() => callbacks.onBack());

    const form = contentEl.createEl('form');
    form.addClass('forge-sentinel-form');

    // Name field
    const nameLabel = form.createEl('label');
    const nameInput = nameLabel.createEl('input', { type: 'text', placeholder: 'Name' }) as HTMLInputElement;

    // Description field
    const descLabel = form.createEl('label');
    const descInput = descLabel.createEl('textarea', { placeholder: 'Description' }) as HTMLTextAreaElement;

    // Model field
    const modelLabel = form.createEl('label');
    const select = modelLabel.createEl('select') as HTMLSelectElement;
    const models = ['haiku', 'sonnet', 'opus'];
    models.forEach((model) => {
      select.createEl('option', { value: model, text: model });
    });

    // Submit button
    form.createEl('button', { type: 'submit', text: 'Submit' });

    // Handle form submission
    form.onsubmit = (e: Event): void => {
      e.preventDefault();
      const data: ForgeFormData = {
        name: nameInput.value || '',
        description: descInput.value || '',
        model: select.value || 'haiku',
      };
      callbacks.onSubmit(data);
    };
  }
}
