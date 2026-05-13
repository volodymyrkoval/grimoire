// Polyfill HTMLElement with Obsidian's DOM extension methods
// Used in happy-dom environment for integration testing

declare global {
  interface HTMLElement {
    createEl(tag: string, opts?: { text?: string; cls?: string; type?: string; value?: string; placeholder?: string; class?: string }): HTMLElement;
    createDiv(opts?: { text?: string; cls?: string; type?: string; value?: string; placeholder?: string; class?: string }): HTMLElement;
    createSpan(opts?: { text?: string; cls?: string; type?: string; value?: string; placeholder?: string; class?: string }): HTMLElement;
    addClass(...names: string[]): void;
    removeClass(...names: string[]): void;
    hasClass(name: string): boolean;
    toggleClass(name: string, force?: boolean): void;
    setText(s: string): void;
    setAttr(name: string, value: string): void;
    empty(): void;
    onClickEvent(fn: (evt: MouseEvent) => void): void;
    hide(): void;
    show(): void;
  }
  // eslint-disable-next-line no-var
  var activeDocument: Document;
}

HTMLElement.prototype.createEl = function (
  tag: string,
  opts?: { text?: string; cls?: string; type?: string; value?: string; placeholder?: string; class?: string }
): HTMLElement {
  const el = document.createElement(tag);

  if (opts?.text !== undefined) {
    el.textContent = opts.text;
  }
  if (opts?.cls !== undefined) {
    el.classList.add(opts.cls);
  }
  if (opts?.class !== undefined) {
    el.classList.add(opts.class);
  }
  if (opts?.type !== undefined) {
    el.setAttribute('type', opts.type);
  }
  if (opts?.value !== undefined) {
    (el as HTMLInputElement).value = opts.value;
  }
  if (opts?.placeholder !== undefined) {
    (el as HTMLInputElement).placeholder = opts.placeholder;
  }

  this.appendChild(el);
  return el;
};

HTMLElement.prototype.createDiv = function (
  opts?: { text?: string; cls?: string; type?: string; value?: string; placeholder?: string; class?: string }
): HTMLElement {
  return this.createEl('div', opts);
};

HTMLElement.prototype.createSpan = function (
  opts?: { text?: string; cls?: string; type?: string; value?: string; placeholder?: string; class?: string }
): HTMLElement {
  return this.createEl('span', opts);
};

HTMLElement.prototype.addClass = function (...names: string[]): void {
  names.forEach((name) => {
    this.classList.add(name);
  });
};

HTMLElement.prototype.removeClass = function (...names: string[]): void {
  names.forEach((name) => {
    this.classList.remove(name);
  });
};

HTMLElement.prototype.hasClass = function (name: string): boolean {
  return this.classList.contains(name);
};

HTMLElement.prototype.toggleClass = function (name: string, force?: boolean): void {
  if (force === undefined) {
    this.classList.toggle(name);
  } else if (force) {
    this.classList.add(name);
  } else {
    this.classList.remove(name);
  }
};

HTMLElement.prototype.setText = function (s: string): void {
  this.textContent = s;
};

HTMLElement.prototype.setAttr = function (name: string, value: string): void {
  this.setAttribute(name, value);
};

HTMLElement.prototype.empty = function (): void {
  while (this.firstChild) {
    this.removeChild(this.firstChild);
  }
};

HTMLElement.prototype.onClickEvent = function (fn: (evt: MouseEvent) => void): void {
  this.addEventListener('click', fn);
};

HTMLElement.prototype.hide = function (): void {
  this.style.display = 'none';
};

HTMLElement.prototype.show = function (): void {
  this.style.removeProperty('display');
};

(globalThis as Record<string, unknown>).activeDocument = document;
