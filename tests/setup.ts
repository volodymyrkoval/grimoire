/**
 * Test globals setup: augments happy-dom and node environments with Obsidian API shims.
 *
 * Obsidian plugins expect DOM methods and helpers (createEl, createDiv, etc.) and
 * custom HTMLElement methods (hide, show, addClass, etc.) that don't exist in standard
 * happy-dom or Node.js. This file provides both:
 *   - Real document (happy-dom): augments HTMLElement prototype with Obsidian methods
 *   - No document (Node): provides a mock document with all required methods
 */

import { vi } from 'vitest';



(globalThis as Record<string, unknown>).activeWindow = globalThis;

function createMockEl(): Record<string, unknown> {
  const el: Record<string, unknown> = {};
  el.style = {};
  el.dataset = {};
  el.classList = { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) };
  el.appendChild = vi.fn(() => el);
  el.removeChild = vi.fn(() => el);
  el.remove = vi.fn();
  el.focus = vi.fn();
  el.blur = vi.fn();
  el.click = vi.fn();
  el.hide = vi.fn();
  el.show = vi.fn();
  el.addClass = vi.fn();
  el.removeClass = vi.fn();
  el.addEventListener = vi.fn();
  el.removeEventListener = vi.fn();
  el.setAttribute = vi.fn();
  el.getAttribute = vi.fn(() => null);
  el.onClickEvent = vi.fn();
  el.createEl = vi.fn((_tag: string) => createMockEl());
  el.createDiv = vi.fn(() => createMockEl());
  el.createSpan = vi.fn(() => createMockEl());
  el.setText = vi.fn();
  el.setAttr = vi.fn();
  el.empty = vi.fn();
  el.append = vi.fn();
  el.value = '';
  el.type = '';
  el.placeholder = '';
  el.textContent = '';
  el.checked = false;
  el.selectedIndex = 0;
  el.options = [];
  el.scrollIntoView = vi.fn();
  return el;
}

function isRealDocument(d: unknown): d is Document {
  return typeof d === 'object' && d !== null && typeof (d as Document).createElement === 'function';
}

if (isRealDocument(globalThis.document)) {
  const doc = globalThis.document as unknown as Record<string, unknown>;
  if (typeof doc['createEl'] !== 'function') {
    doc['createEl'] = (tag: string, opts?: { text?: string; cls?: string }) => {
      const el = (globalThis.document as Document).createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      return el;
    };
  }
  if (typeof doc['createDiv'] !== 'function') {
    doc['createDiv'] = (opts?: { cls?: string }) => {
      const el = (globalThis.document as Document).createElement('div');
      if (opts?.cls) el.className = opts.cls;
      return el;
    };
  }
  if (typeof doc['createSpan'] !== 'function') {
    doc['createSpan'] = (opts?: { text?: string; cls?: string }) => {
      const el = (globalThis.document as Document).createElement('span');
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      return el;
    };
  }

  const proto = (globalThis as unknown as { HTMLElement: { prototype: Record<string, unknown> } })
    .HTMLElement.prototype;
  if (typeof proto['hide'] !== 'function') {
    proto['hide'] = function (this: HTMLElement) { this.style.display = 'none'; };
  }
  if (typeof proto['show'] !== 'function') {
    proto['show'] = function (this: HTMLElement) { this.style.display = ''; };
  }
  if (typeof proto['addClass'] !== 'function') {
    proto['addClass'] = function (this: HTMLElement, cls: string) { this.classList.add(cls); };
  }
  if (typeof proto['removeClass'] !== 'function') {
    proto['removeClass'] = function (this: HTMLElement, cls: string) { this.classList.remove(cls); };
  }
  if (typeof proto['onClickEvent'] !== 'function') {
    proto['onClickEvent'] = function (this: HTMLElement, handler: (e: MouseEvent) => void) {
      this.addEventListener('click', handler);
    };
  }
  if (typeof proto['setText'] !== 'function') {
    proto['setText'] = function (this: HTMLElement, text: string) { this.textContent = text; };
  }
  if (typeof proto['setAttr'] !== 'function') {
    proto['setAttr'] = function (this: HTMLElement, attr: string, value: string) {
      this.setAttribute(attr, value);
    };
  }
  if (typeof proto['empty'] !== 'function') {
    proto['empty'] = function (this: HTMLElement) { this.innerHTML = ''; };
  }
  if (typeof proto['createEl'] !== 'function') {
    proto['createEl'] = function (this: HTMLElement, tag: string, opts?: { text?: string; cls?: string }) {
      const el = (globalThis.document as Document).createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }
  if (typeof proto['createDiv'] !== 'function') {
    proto['createDiv'] = function (this: HTMLElement, opts?: { cls?: string }) {
      const el = (globalThis.document as Document).createElement('div');
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }
  if (typeof proto['createSpan'] !== 'function') {
    proto['createSpan'] = function (this: HTMLElement, opts?: { text?: string; cls?: string }) {
      const el = (globalThis.document as Document).createElement('span');
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }

  (globalThis as Record<string, unknown>).activeDocument = globalThis.document;
} else {
  const mockDoc = createMockEl();
  mockDoc['createEl'] = vi.fn((tag: string) => {
    const el = createMockEl();
    el['tagName'] = (tag as string).toUpperCase();
    return el;
  });
  mockDoc['createElement'] = vi.fn((tag: string) => {
    const el = createMockEl();
    el['tagName'] = (tag as string).toUpperCase();
    return el;
  });
  mockDoc['createDiv'] = vi.fn((_opts?: unknown) => createMockEl());
  mockDoc['createSpan'] = vi.fn(() => createMockEl());
  (globalThis as Record<string, unknown>).activeDocument = mockDoc;
}
