import { vi } from 'vitest';

export class App {
  vault = {
    getMarkdownFiles: vi.fn<() => any[]>(() => []),
  };
  metadataCache = {
    getFileCache: vi.fn<(file: any) => any>(() => null),
  };
}

export class TFile {
  constructor(public basename: string, public path: string) {}
}

type RegisteredHandler = (e: KeyboardEvent) => boolean;

function scopeKey(modifiers: string[], key: string): string {
  return [...modifiers].sort().join('+') + '::' + key;
}

export class Scope {
  private readonly handlers = new Map<string, RegisteredHandler[]>();
  // For unit tests that expect to spy on register/unregister, provide vi.fn() methods
  // that forward to real implementation. For integration tests, these will be called directly.
  register = vi.fn((modifiers: string[], key: string, handler: RegisteredHandler): RegisteredHandler => {
    const k = scopeKey(modifiers, key);
    const bucket = this.handlers.get(k) ?? [];
    bucket.unshift(handler); // LIFO
    this.handlers.set(k, bucket);
    return handler;
  });

  unregister = vi.fn((handler: RegisteredHandler): void => {
    for (const [k, bucket] of this.handlers) {
      const i = bucket.indexOf(handler);
      if (i >= 0) {
        bucket.splice(i, 1);
        if (bucket.length === 0) this.handlers.delete(k);
      }
    }
  });

  dispatch(key: string, modifiers: string[] = []): boolean {
    const k = scopeKey(modifiers, key);
    const bucket = this.handlers.get(k) ?? [];
    const fakeEvent = new KeyboardEvent('keydown', { key, bubbles: true });
    for (const h of bucket) {
      if (h(fakeEvent) === false) return true; // handler claimed it
    }
    return false;
  }
}

// Create a mock element for Node environment (vitest run with environment: 'node')
function createMockElement(): any {
  const el: any = {};
  el.empty = vi.fn();
  el.appendChild = vi.fn();
  el.removeChild = vi.fn();
  el.remove = vi.fn();
  el.addClass = vi.fn();
  el.removeClass = vi.fn();
  el.focus = vi.fn();
  el.onClickEvent = vi.fn();
  el.value = '';
  el.placeholder = '';
  el.oninput = null;
  el.onsubmit = null;
  el.selectedIndex = 0;
  el.options = { length: 0 };
  el.createEl = vi.fn().mockImplementation(() => createMockElement());
  el.createDiv = vi.fn().mockImplementation(() => createMockElement());
  el.createSpan = vi.fn().mockImplementation(() => createMockElement());
  el.setText = vi.fn();
  el.setAttr = vi.fn();
  el.classList = { add: vi.fn(), remove: vi.fn(), contains: vi.fn() };
  return el;
}

export class Modal {
  readonly app: App;
  readonly scope = new Scope();
  readonly contentEl: HTMLElement | any;

  constructor(app: App) {
    this.app = app;
    // Use document if available (happy-dom integration tests), otherwise use mock
    if (typeof document !== 'undefined') {
      this.contentEl = document.createElement('div');
    } else {
      // Node environment (unit tests) — use vi.fn() mock
      this.contentEl = createMockElement();
    }
  }

  open(): void {
    if (typeof document !== 'undefined') {
      document.body.appendChild(this.contentEl);
    }
    this.onOpen();
  }

  close(): void {
    this.onClose();
    if (typeof document !== 'undefined') {
      this.contentEl.remove();
    }
  }

  onOpen(): void {}
  onClose(): void {}
}

export function prepareFuzzySearch(query: string): (text: string) => { score: number } | null {
  const lower = query.toLowerCase();
  return (text: string) => {
    const t = text.toLowerCase();
    let qi = 0;
    for (let i = 0; i < t.length && qi < lower.length; i++) {
      if (t[i] === lower[qi]) qi++;
    }
    return qi === lower.length ? { score: lower.length - t.length } : null;
  };
}

export function sortSearchResults(results: Array<{ match: { score: number } }>): void {
  results.sort((a, b) => b.match.score - a.match.score);
}

export class Plugin {
  readonly app: App;
  loadData = vi.fn(async () => undefined);
  saveData = vi.fn(async () => {});
  addCommand = vi.fn();
  addSettingTab = vi.fn();

  constructor(app: App) {
    this.app = app;
  }
}

export class PluginSettingTab {
  readonly app: App;
  readonly plugin: Plugin;
  readonly containerEl: HTMLElement | any;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    // Use document if available (happy-dom), otherwise use mock
    if (typeof document !== 'undefined') {
      this.containerEl = document.createElement('div');
    } else {
      this.containerEl = createMockElement();
    }
  }

  display(): void {}
  hide(): void {}
}

class TextComponent {
  private onChangeHandler: ((value: string) => void) | null = null;
  readonly inputEl: HTMLInputElement | any;

  constructor(containerEl: HTMLElement | any) {
    if (typeof document !== 'undefined') {
      this.inputEl = document.createElement('input') as HTMLInputElement;
      this.inputEl.type = 'text';
      containerEl.appendChild(this.inputEl);
    } else {
      this.inputEl = createMockElement();
      this.inputEl.value = '';
    }
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChange(handler: (value: string) => void): this {
    this.onChangeHandler = handler;
    return this;
  }

  __triggerChange(value: string): void {
    this.inputEl.value = value;
    if (this.onChangeHandler) {
      this.onChangeHandler(value);
    }
  }
}

class DropdownComponent {
  private onChangeHandler: ((value: string) => void) | null = null;
  readonly selectEl: HTMLSelectElement | any;

  constructor(containerEl: HTMLElement | any) {
    if (typeof document !== 'undefined') {
      this.selectEl = document.createElement('select') as HTMLSelectElement;
      containerEl.appendChild(this.selectEl);
    } else {
      this.selectEl = createMockElement();
      this.selectEl.value = '';
      this.selectEl.options = { length: 0 };
    }
  }

  addOption(value: string, label: string): this {
    if (typeof document !== 'undefined') {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      this.selectEl.appendChild(option);
    } else {
      // In node env, mock the options array
      if (!Array.isArray(this.selectEl.options)) {
        this.selectEl.options = [];
      }
      (this.selectEl.options as any).push({ value, label });
      this.selectEl.options.length = (this.selectEl.options as any).length;
    }
    return this;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  onChange(handler: (value: string) => void): this {
    this.onChangeHandler = handler;
    return this;
  }

  __triggerChange(value: string): void {
    this.selectEl.value = value;
    if (this.onChangeHandler) {
      this.onChangeHandler(value);
    }
  }
}

export class Setting {
  readonly settingEl: HTMLElement | any;
  readonly controlEl: HTMLElement | any;

  constructor(containerEl: HTMLElement | any) {
    if (typeof document !== 'undefined') {
      this.settingEl = document.createElement('div');
      this.controlEl = document.createElement('div');
      containerEl.appendChild(this.settingEl);
      containerEl.appendChild(this.controlEl);
    } else {
      this.settingEl = createMockElement();
      this.controlEl = createMockElement();
    }
  }

  setName(name: string): this {
    if (typeof this.settingEl.textContent !== 'undefined') {
      this.settingEl.textContent = name;
    } else {
      this.settingEl.setText?.(name);
    }
    return this;
  }

  setDesc(desc: string): this {
    if (typeof this.settingEl.textContent !== 'undefined') {
      // In happy-dom, just append to settingEl for simplicity
      const descEl = document.createElement('div');
      descEl.textContent = desc;
      this.settingEl.appendChild(descEl);
    } else {
      // In node, call a mock method if it exists
      this.settingEl.setText?.(desc);
    }
    return this;
  }

  addText(callback: (component: TextComponent) => void): this {
    const textComponent = new TextComponent(this.controlEl);
    callback(textComponent);
    return this;
  }

  addDropdown(callback: (component: DropdownComponent) => void): this {
    const dropdownComponent = new DropdownComponent(this.controlEl);
    callback(dropdownComponent);
    return this;
  }
}
