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
  #abort: AbortController | null = null;

  /** Creates label and <select> as direct children of `parent`. */
  mount(parent: HTMLElement, deps: RefineVariantSelectDeps): void {
    this.#abort = new AbortController();
    const { label, select } = this.#createElements(parent);
    this.#mountedEls = [label, select];
    this.#populateOptions(select, deps.variants);
    select.value = deps.initialPath ?? '';
    select.addEventListener('change', () => {
      deps.onChange(select.value === '' ? null : select.value);
    }, { signal: this.#abort.signal });
  }

  /** Removes all mounted elements from the DOM. */
  destroy(): void {
    this.#abort?.abort();
    for (const el of this.#mountedEls) {
      el.remove();
    }
    this.#mountedEls = [];
  }

  #createElements(parent: HTMLElement): { label: HTMLElement; select: HTMLSelectElement } {
    return {
      label: parent.createSpan({ text: 'Refine variant', cls: 'grimoire-field-label' }),
      select: parent.createEl('select'),
    };
  }

  #populateOptions(select: HTMLSelectElement, variants: readonly RefineSentinelEntry[]): void {
    const defaultOpt = select.createEl('option', { text: 'Default (built-in)' });
    defaultOpt.value = '';
    for (const entry of variants) {
      const opt = select.createEl('option', { text: entry.name });
      opt.value = entry.path;
    }
  }
}
