import { Modal, Setting } from 'obsidian';

/**
 * Confirmation modal for clearing all cast logs.
 * Displays a count of logs to be deleted and offers Confirm/Cancel actions.
 */
export class ClearAllConfirmModal extends Modal {
  readonly #count: number;
  readonly #onConfirm: () => void;

  constructor(app: import('obsidian').App, _count: number, _onConfirm: () => void) {
    super(app);
    this.#count = _count;
    this.#onConfirm = _onConfirm;
  }

  onOpen(): void {
    this.#renderMessage();
    this.#renderButtons();
  }

  #renderMessage(): void {
    new Setting(this.contentEl)
      .setName(`Remove all ${this.#count} casts?`)
      .setHeading();
  }

  #renderButtons(): void {
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Cancel')
          .setCta()
          .onClick(() => this.close())
          .setClass('cast-log-modal-cancel-btn')
      )
      .addButton((btn) =>
        btn
          .setButtonText('Remove')
          .setWarning()
          .onClick(() => {
            this.#onConfirm();
            this.close();
          })
          .setClass('cast-log-modal-remove-btn')
      );
  }
}
