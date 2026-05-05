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
