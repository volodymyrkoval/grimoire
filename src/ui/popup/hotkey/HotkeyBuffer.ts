import { TypedEmitter } from '../../../infra/TypedEmitter';

/**
 * Immutable buffer state for a hotkey sequence.
 * - `empty`: no letters buffered yet (initial state)
 * - `normal`: 1–2 letters buffered, evaluation is neutral/success
 * - `error`: 1–2 letters buffered, evaluation failed (e.g. no matching spell)
 */
export type BufferState =
  | { letters: ''; status: 'empty' }
  | { letters: string; status: 'normal' | 'error' };

/**
 * Manages typed hotkey sequences with state changes and event emission.
 * Buffers up to 2 letters; appending a 3rd replaces the buffer entirely.
 */
export class HotkeyBuffer {
  #state: BufferState = { letters: '', status: 'empty' };
  #emitter = new TypedEmitter<{ change: BufferState }>();

  /**
   * Returns the current buffer state.
   */
  state(): BufferState {
    return this.#state;
  }

  /**
   * Registers a listener for state changes.
   */
  on(event: 'change', cb: (state: BufferState) => void): void {
    this.#emitter.on(event, cb);
  }

  /**
   * Clears the buffer to empty state and emits a change event.
   */
  clear(): void {
    this.#state = { letters: '', status: 'empty' };
    this.#emitter.emit('change', this.#state);
  }

  /**
   * Updates the evaluation status of the current buffer.
   * No-op if the buffer is empty (no event emitted).
   */
  setEvaluation(status: 'normal' | 'error'): void {
    if (this.#state.status === 'empty') {
      return;
    }
    this.#state = { ...this.#state, status };
    this.#emitter.emit('change', this.#state);
  }

  /**
   * Appends a letter to the buffer.
   * - Empty → 1 letter
   * - 1 letter → 2 letters
   * - 2 letters → replace (overflow)
   * Status always resets to 'normal' on append.
   */
  append(letter: string): void {
    const currentLetters = this.#state.status === 'empty' ? '' : this.#state.letters;
    const newLetters = currentLetters.length < 2 ? currentLetters + letter : letter;
    this.#state = { letters: newLetters, status: 'normal' };
    this.#emitter.emit('change', this.#state);
  }
}
