import type { Hotkey } from '../../domain/spells/Hotkey';
import type { SpellPath } from '../../domain/spells/SpellPath';
import type { HotkeyDirectory } from '../../forge/HotkeyDirectory';
import type { HotkeyEraser } from './ForgeSentinelDetail';
import { validateHotkeyCommit } from '../../forge/hotkeyCommitValidator';

// ─── Public surface ────────────────────────────────────────────────────────────

export interface HotkeyCaptureFieldParams {
  /** The element this field renders into. */
  container: HTMLElement;
  /** create mode: null; update mode: spell.hotkey */
  initialPersisted: Hotkey | null;
  /** create mode: null; update mode: spell.path (used for self-exclusion in collision check) */
  selfPath: SpellPath | null;
  directory: HotkeyDirectory;
  /** null in create mode — the dialog never has a persisted value to erase before commit */
  eraser: HotkeyEraser | null;
  onChange: (hotkey: Hotkey | null) => void;
}

/** Reason codes for rejected hotkey commits, plus the erase-failed path. */
type ErrorReason = 'pattern' | 'reserved-forge' | 'reserved-refine' | 'collision' | 'erase-failed';

/**
 * Button + chip + capture-state-machine widget for hotkey authoring.
 *
 * Keeps the `.grimoire-hotkey-button` element alive across state transitions so
 * callers that hold a reference to it can observe textContent changes.  The chip
 * and error span are inserted/removed dynamically; callers must re-query them
 * after each interaction.
 *
 * States:
 *   default  — shows persisted chip (if any) and a "Hotkey" button
 *   capture  — shows live-buffer chip, "×" cancel, and "Save" button
 */
export class HotkeyCaptureField {
  #params!: HotkeyCaptureFieldParams;
  #state!: FieldState;

  /** Persistent button element — survives every state transition. */
  #hotkeyBtn!: HTMLButtonElement;

  /**
   * Pre-button area: holds the chip and clear button (if any).
   * Sits before `#hotkeyBtn` in the container; rebuilt on every state change.
   */
  #preArea!: HTMLElement;

  /**
   * Post-button area: holds the inline error message (if any).
   * Sits after `#hotkeyBtn` in the container; rebuilt on every state change.
   */
  #postArea!: HTMLElement;

  #keydownHandler!: (e: KeyboardEvent) => void;
  #focusoutHandler!: (e: FocusEvent) => void;

  /**
   * Mount the widget into `params.container`.
   * Builds stable wrapper elements so the persistent button reference stays valid.
   * Calling render() again re-mounts from scratch — call destroy() first for clean teardown.
   */
  render(params: HotkeyCaptureFieldParams): void {
    this.#params = params;
    this.#state = { phase: 'default', persisted: params.initialPersisted };

    params.container.dataset['grimoire'] = 'hotkey-field';

    // Stable layout: [pre-area] [button] [post-area].
    // pre-area and post-area are emptied and rebuilt on each sync.
    this.#preArea = params.container.createDiv();
    const btn = params.container.createEl('button', { cls: 'grimoire-hotkey-button' });
    btn.type = 'button';
    btn.textContent = 'Hotkey';
    btn.addEventListener('click', () => this.#handleHotkeyBtnClick());
    this.#hotkeyBtn = btn;
    this.#postArea = params.container.createDiv();

    this.#syncDOM();

    this.#keydownHandler = (e: KeyboardEvent) => this.#handleKeydown(e);
    this.#focusoutHandler = (e: FocusEvent) => this.#handleFocusout(e);
    params.container.addEventListener('keydown', this.#keydownHandler);
    params.container.addEventListener('focusout', this.#focusoutHandler);

    params.onChange(params.initialPersisted);
  }

  /** Remove DOM event listeners attached by render(). */
  destroy(): void {
    if (this.#keydownHandler) {
      this.#params?.container.removeEventListener('keydown', this.#keydownHandler);
    }
    if (this.#focusoutHandler) {
      this.#params?.container.removeEventListener('focusout', this.#focusoutHandler);
    }
  }

  // ─── DOM sync ──────────────────────────────────────────────────────────────

  /**
   * Rebuilds `#preArea` and `#postArea` to match the current state.
   * The persistent `#hotkeyBtn` is never replaced — only its textContent changes.
   */
  #syncDOM(): void {
    this.#preArea.empty();
    this.#postArea.empty();

    if (this.#state.phase === 'default') {
      this.#syncDefault(this.#state);
    } else {
      this.#syncCapture(this.#state);
    }
  }

  #syncDefault(state: DefaultState): void {
    this.#hotkeyBtn.textContent = 'Hotkey';

    if (state.persisted !== null) {
      const chip = this.#preArea.createSpan({ cls: 'grimoire-hotkey-chip' });
      chip.textContent = state.persisted;

      const clearBtn = this.#preArea.createEl('button', { cls: 'grimoire-hotkey-clear' });
      clearBtn.type = 'button';
      clearBtn.textContent = '×';
      clearBtn.addEventListener('click', () => void this.#handlePersistClear());
    }
  }

  #syncCapture(state: CaptureState): void {
    this.#hotkeyBtn.textContent = 'Save';
    this.#renderBufferChip(state);
    this.#renderCancelButton(state.previous);
    if (state.error !== null) this.#renderInlineError(state.error);
  }

  #renderBufferChip(state: CaptureState): void {
    const chip = this.#preArea.createSpan({ cls: 'grimoire-hotkey-chip' });
    chip.textContent = state.buffer;
    if (state.error !== null) chip.classList.add('is-error');
  }

  #renderCancelButton(previous: Hotkey | null): void {
    const clearBtn = this.#preArea.createEl('button', { cls: 'grimoire-hotkey-clear' });
    clearBtn.type = 'button';
    clearBtn.textContent = '×';
    clearBtn.addEventListener('click', () => {
      this.#state = { phase: 'default', persisted: previous };
      this.#syncDOM();
    });
  }

  #renderInlineError(message: string): void {
    const errEl = this.#postArea.createSpan({ cls: 'grimoire-hotkey-error' });
    errEl.textContent = message;
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  #handleHotkeyBtnClick(): void {
    if (this.#state.phase === 'default') {
      // Enter capture
      this.#state = {
        phase: 'capture',
        buffer: '',
        previous: this.#state.persisted,
        error: null,
      };
      this.#syncDOM();
    } else {
      // Save = commit
      this.#tryCommit(this.#state);
    }
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (this.#state.phase !== 'capture') return;

    const key = event.key;
    const noModifiers = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
    const state = this.#state;

    if (noModifiers && /^[a-z]$/.test(key)) {
      if (state.buffer.length < 2) {
        this.#state = { ...state, buffer: state.buffer + key, error: null };
        this.#syncDOM();
      }
      // third keystroke silently ignored — capped at 2
    } else if (noModifiers && key === 'Backspace') {
      this.#state = { ...state, buffer: state.buffer.slice(0, -1), error: null };
      this.#syncDOM();
    } else if (key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.#tryCommit(state);
    }
  }

  #handleFocusout(event: FocusEvent): void {
    if (this.#state.phase !== 'capture') return;
    const related = event.relatedTarget as Node | null;
    if (!related || !this.#params.container.contains(related)) {
      this.#state = { phase: 'default', persisted: this.#state.previous };
      this.#syncDOM();
    }
  }

  // ─── Commit flow ───────────────────────────────────────────────────────────

  #tryCommit(state: CaptureState): void {
    const result = validateHotkeyCommit(state.buffer, this.#params.selfPath, this.#params.directory);
    if (result.ok) {
      this.#state = { phase: 'default', persisted: result.hotkey };
      this.#params.onChange(result.hotkey);
      this.#syncDOM();
    } else {
      const errMsg = errorCopyFor(
        result.reason,
        'collidingSpellName' in result ? result.collidingSpellName : undefined,
      );
      this.#state = { ...state, error: errMsg };
      this.#syncDOM();
    }
  }

  /** Handles clicking × on the persisted chip in default state. */
  async #handlePersistClear(): Promise<void> {
    const { eraser, selfPath, onChange } = this.#params;
    const state = this.#state;

    if (state.phase !== 'default' || !eraser || !selfPath) return;

    try {
      await eraser(selfPath);
      this.#state = { phase: 'default', persisted: null };
      onChange(null);
      this.#syncDOM();
    } catch {
      // Keep chip but show "Could not clear hotkey."
      this.#state = { phase: 'default', persisted: state.persisted };
      this.#syncDOM();
      this.#renderInlineError(errorCopyFor('erase-failed'));
    }
  }
}

// ─── State types ───────────────────────────────────────────────────────────────

type DefaultState = { phase: 'default'; persisted: Hotkey | null };
type CaptureState = { phase: 'capture'; buffer: string; previous: Hotkey | null; error: string | null };
// FieldState is the union used by #state; narrowed via .phase discriminant
type FieldState = DefaultState | CaptureState;

// ─── Error copy ────────────────────────────────────────────────────────────────

/**
 * Returns human-readable error text for a failed hotkey commit or erase.
 * @param reason The rejection reason from validateHotkeyCommit, or 'erase-failed'.
 * @param collidingSpellName Name of the spell that holds the colliding hotkey (collision case only).
 */
export function errorCopyFor(reason: ErrorReason, collidingSpellName?: string): string {
  switch (reason) {
    case 'pattern':
      return 'One or two lowercase letters only.';
    case 'reserved-forge':
      return 'Reserved for Forge.';
    case 'reserved-refine':
      return 'Reserved for Refine.';
    case 'collision':
      return `Hotkey already used by ${collidingSpellName ?? 'another spell'}.`;
    case 'erase-failed':
      return 'Could not clear hotkey.';
  }
}
