export interface SegmentedControlOptions<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
}

export class SegmentedControl<T extends string> {
  #current: T;
  #buttons: Map<T, HTMLButtonElement> = new Map();
  #onChange: (next: T) => void;
  #wrapper: HTMLElement | null = null;

  constructor(parent: HTMLElement, opts: SegmentedControlOptions<T>) {
    if (!opts.options.includes(opts.value)) {
      throw new Error(`SegmentedControl: value '${opts.value}' not in options`);
    }
    this.#current = opts.value;
    this.#onChange = opts.onChange;

    const wrapper = activeDocument.createDiv();
    wrapper.className = 'grimoire-segmented';
    this.#wrapper = wrapper;

    this.#buildButtons(wrapper, opts.options, opts.value);
    parent.appendChild(wrapper);
  }

  setValue(next: T): void {
    this.#current = next;
    this.#applyActive(next);
  }

  focusSelected(): void {
    const btn = this.#buttons.get(this.#current);
    if (btn) {
      btn.focus();
    }
  }

  setOptions(options: readonly T[], value: T): void {
    if (!options.includes(value)) {
      throw new Error(`SegmentedControl: value '${value}' not in options`);
    }
    if (!this.#wrapper) return;

    const currentKeys = [...this.#buttons.keys()];
    const sameOptions =
      currentKeys.length === options.length &&
      currentKeys.every((k, i) => k === options[i]);

    if (sameOptions) {
      if (value === this.#current) return; // nothing changed
      const prevBtn = this.#buttons.get(this.#current);
      const hadFocus = prevBtn != null && activeDocument.activeElement === prevBtn;
      this.#current = value;
      this.#applyActive(value);
      if (hadFocus) {
        this.#buttons.get(value)?.focus();
      }
      return;
    }

    // Options changed — full rebuild
    this.#current = value;
    this.#buttons.clear();
    while (this.#wrapper.firstChild) {
      this.#wrapper.removeChild(this.#wrapper.firstChild);
    }
    this.#buildButtons(this.#wrapper, options, value);
  }

  #buildButtons(wrapper: HTMLElement, options: readonly T[], value: T): void {
    for (const opt of options) {
      const btn = activeDocument.createEl('button');
      btn.type = 'button';
      btn.className = 'grimoire-segmented__btn';
      btn.textContent = opt;
      this.#buttons.set(opt, btn);
      // @todo replace with Keyboard controller
      btn.addEventListener('click', () => this.#handleClick(opt));
      btn.addEventListener('keydown', (e) => this.#handleArrow(e));
      wrapper.appendChild(btn);
    }
    this.#applyActive(value);
  }

  #handleArrow(e: KeyboardEvent): void {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const keys = [...this.#buttons.keys()];
    const idx = keys.indexOf(this.#current);
    const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= keys.length) return; // boundary — no-op
    e.preventDefault();
    const nextOpt = keys[nextIdx];
    this.#current = nextOpt;
    this.#applyActive(nextOpt); // tabIndex must be set before focus
    this.#buttons.get(nextOpt)!.focus();
    this.#onChange(nextOpt);
  }

  #handleClick(opt: T): void {
    if (opt === this.#current) return;
    this.#current = opt;
    this.#applyActive(opt);
    this.#onChange(opt);
  }

  #applyActive(active: T): void {
    for (const [opt, btn] of this.#buttons) {
      if (opt === active) {
        btn.classList.add('is-active');
        btn.tabIndex = 0;
      } else {
        btn.classList.remove('is-active');
        btn.tabIndex = -1;
      }
    }
  }
}
