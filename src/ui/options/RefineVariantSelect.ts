import type { RefineSentinelEntry } from '../../refine/refineSentinelScanner';

/** Dependencies for mounting a RefineVariantSelect widget. */
export interface RefineVariantSelectDeps {
  /** Sentinel-marked files available as custom Refine templates. */
  variants: readonly RefineSentinelEntry[];
  /** Currently active path (from session or settings), or null for the built-in default. */
  initialPath: string | null;
  /** Called when the user picks a different variant. null = "Default (built-in)". */
  onChange: (path: string | null) => void;
}

/**
 * Widget that renders a variant selector inside the Refine options panel,
 * listing "Default (built-in)" plus every sentinel-marked template file.
 *
 * Mirrors CastModelSection's header pattern: <hr> + <small> label + <select>
 * as direct children of the parent form, sharing the .options-panel gap rhythm.
 *
 * Lifecycle: call {@link mount} once after construction, {@link destroy} to remove from DOM.
 */
export class RefineVariantSelect {
  #mountedEls: HTMLElement[] = [];

  /**
   * Creates <hr>, <small> label, and <select> as direct children of `parent`.
   * Sets the initial selected value and wires the change listener.
   */
  mount(parent: HTMLElement, deps: RefineVariantSelectDeps): void {
    const hr = parent.createEl('hr');
    const label = parent.createEl('small', { text: 'Refine variant' });
    const select = parent.createEl('select');
    this.#mountedEls = [hr, label, select];

    // First option: the built-in default
    const defaultOpt = select.createEl('option', { text: 'Default (built-in)' });
    defaultOpt.value = '';

    // One option per sentinel entry
    for (const entry of deps.variants) {
      const opt = select.createEl('option', { text: entry.name });
      opt.value = entry.path;
    }

    // Restore the initial selection
    select.value = deps.initialPath ?? '';

    select.addEventListener('change', () => {
      deps.onChange(select.value === '' ? null : select.value);
    });
  }

  /** Removes all mounted elements from the DOM. */
  destroy(): void {
    for (const el of this.#mountedEls) {
      el.remove();
    }
    this.#mountedEls = [];
  }
}
