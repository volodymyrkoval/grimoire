import { vi } from 'vitest';

export class Scope {
  register = vi.fn(() => ({}));
  unregister = vi.fn();
}

// Recursive mock element — every DOM-creation method returns another mock element
function makeMockEl(): any {
  const el: any = {};
  const child = () => makeMockEl();
  el.empty = vi.fn();
  el.appendChild = vi.fn();
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
  el.createEl = vi.fn().mockImplementation(() => makeMockEl());
  el.createDiv = vi.fn().mockImplementation(() => makeMockEl());
  el.createSpan = vi.fn().mockImplementation(() => makeMockEl());
  el.setText = vi.fn();
  el.setAttr = vi.fn();
  el.classList = { add: vi.fn(), remove: vi.fn(), contains: vi.fn() };
  return el;
}

export class Modal {
  scope = new Scope();
  contentEl: any = makeMockEl();
  close() {}
}

export class App {}
