import { KeyboardController, type BindingRelease } from '../../../infra/KeyboardController';
import type { HotkeyBuffer } from './HotkeyBuffer';
import type { HotkeyRegistry } from './HotkeyRegistry';

/** Dependencies injected into HotkeyCapture at construction time. */
export interface HotkeyCaptureDeps {
  /**
   * The popup's shared KeyboardController (wrapping Modal.scope).
   * Injecting the popup's controller means kb.suspend() / kb.resume() on the
   * popup's side automatically cover the capture's bindings — no separate
   * uninstall/reinstall needed during detail-phase transitions.
   */
  kb: KeyboardController;
  /** Shared buffer that tracks the current hotkey letter sequence. */
  buffer: HotkeyBuffer;
  /** Registry of registered hotkeys built from spells + sentinels. */
  registry: HotkeyRegistry;
  /** Called with the global row index when an exact hotkey match fires. */
  focusRow: (rowIndex: number) => void;
  /**
   * Returns the currently focused element. Defaults to `document.activeElement`.
   * Injectable for unit-test environments that lack a real DOM.
   */
  getActiveElement?: () => Element | null;
}

/**
 * Capture layer for Shift+letter hotkey sequences.
 *
 * Owns 26 Shift+a..Shift+z bindings on the popup's keyboard scope via an
 * injected KeyboardController. Because the popup's own controller is injected,
 * kb.suspend() (called on detail-phase entry) automatically removes the
 * capture bindings without a separate uninstall() call.
 *
 * Each binding feeds the letter into the buffer, evaluates against the
 * registry, and dispatches one of three outcomes:
 * - exact: call focusRow(rowIndex), keep the letter in the buffer with
 *   'normal' status so the user sees visual confirmation and can extend a
 *   one-letter match into a two-letter sequence
 * - prefix: set buffer evaluation to 'normal' (waiting for second letter)
 * - miss: set buffer evaluation to 'error'
 */
export class HotkeyCapture {
  readonly #kb: KeyboardController;
  readonly #buffer: HotkeyBuffer;
  readonly #registry: HotkeyRegistry;
  readonly #focusRow: (rowIndex: number) => void;
  readonly #getActiveElement: () => Element | null;
  #releases: BindingRelease[] = [];

  constructor(deps: HotkeyCaptureDeps) {
    this.#kb = deps.kb;
    this.#buffer = deps.buffer;
    this.#registry = deps.registry;
    this.#focusRow = deps.focusRow;
    this.#getActiveElement =
      deps.getActiveElement ?? (() => (typeof activeDocument !== 'undefined' ? activeDocument.activeElement : null));
  }

  /**
   * Registers Shift+a through Shift+z bindings on the scope.
   * Each binding checks the focused element first: if an INPUT, TEXTAREA, or
   * SELECT is active the key is passed through (not consumed) so normal typing
   * works inside Forge fields. Otherwise the letter is fed to #feed and the
   * event is consumed.
   * Release tokens are retained so uninstall() can remove ONLY these 26
   * bindings, leaving any other bindings (e.g. the popup's navigation keys)
   * on the shared controller intact.
   */
  install(): void {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (const letter of letters) {
      const captured = letter;
      const release = this.#kb.bind(['Shift'], captured, () => {
        const el = this.#getActiveElement();
        const tag = el?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          return false;
        }
        this.#feed(captured);
        return true;
      });
      this.#releases.push(release);
    }
  }

  /**
   * Releases the 26 Shift+letter bindings registered by install(), leaving any
   * other bindings on the shared controller untouched. Idempotent — safe to
   * call when nothing is installed.
   */
  uninstall(): void {
    for (const release of this.#releases) release.release();
    this.#releases = [];
  }

  /**
   * Feeds a letter into the buffer and evaluates against the registry.
   *
   * Outcomes:
   * - exact match → focusRow(target.rowIndex), buffer keeps letter with 'normal'
   *   status (green) so the user sees visual confirmation. Keeping the letter
   *   also lets the user extend a one-letter match into a two-letter hotkey
   *   (e.g. press Shift+f then Shift+d to fire 'fd'). The buffer is cleared
   *   by other paths — Escape, arrow keys, Tab switch, popup close, × click.
   * - prefix match → buffer.setEvaluation('normal')
   * - miss → buffer.setEvaluation('error')
   */
  #feed(letter: string): void {
    this.#buffer.append(letter);
    const hit = this.#registry.lookup(this.#buffer.state().letters);
    switch (hit.state) {
      case 'exact':
        this.#focusRow(hit.target.rowIndex);
        this.#buffer.setEvaluation('normal');
        break;
      case 'prefix':
        this.#buffer.setEvaluation('normal');
        break;
      case 'miss':
        this.#buffer.setEvaluation('error');
        break;
    }
  }
}
