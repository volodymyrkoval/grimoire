/**
 * Renders the tab-bar right-slot chrome for hotkey state:
 * - hint text when the buffer is empty,
 * - a buffer indicator (letters + clear button) when the buffer has content,
 * - nothing when on the Logs tab or in detail phase.
 *
 * All operations are idempotent: the container is cleared before each paint.
 */
export interface HotkeyHintSlotDeps {
  /** The element to render into. Owned by the caller; must outlive the slot. */
  container: HTMLElement;
  /** Called when the user clicks the × clear button in the indicator view. */
  onClear: () => void;
}

/** Manages the hotkey hint/indicator slot rendered in the tab bar's right corner. */
export class HotkeyHintSlot {
  readonly #container: HTMLElement;
  readonly #onClear: () => void;

  constructor(deps: HotkeyHintSlotDeps) {
    this.#container = deps.container;
    this.#onClear = deps.onClear;
  }

  /**
   * Shows the static hint text: "Shift + letters for hotkeys".
   * Replaces any previous content.
   */
  renderHint(): void {
    this.#container.empty();
    const span = this.#container.createSpan({ cls: 'hotkey-hint' });
    span.setText('Shift + letters for hotkeys');
  }

  /**
   * Shows the buffer indicator: the buffered letters and a × clear button.
   * Applies `is-error` class when status is 'error'.
   * Replaces any previous content.
   */
  renderIndicator(letters: string, status: 'normal' | 'error'): void {
    this.#container.empty();
    const cls = status === 'error'
      ? 'hotkey-buffer-indicator is-error'
      : 'hotkey-buffer-indicator';
    const indicator = this.#container.createSpan({ cls });
    indicator.createSpan({ cls: 'hotkey-buffer-letters', text: letters });
    const clearBtn = indicator.createEl('button', {
      cls: 'hotkey-buffer-clear',
      type: 'button',
      text: '×',
    });
    clearBtn.addEventListener('click', () => this.#onClear());
  }

  /** Empties the container, hiding both hint and indicator. */
  hide(): void {
    this.#container.empty();
  }
}
