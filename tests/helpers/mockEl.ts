import { vi } from 'vitest';

/**
 * Factory for mock DOM elements used in UI component tests.
 * Returns a recursively mockable element with common HTMLElement/Obsidian API methods.
 */
export function makeMockEl(): any {
  const el: any = {
    empty: vi.fn(),
    addClass: vi.fn(),
    removeClass: vi.fn(),
    scrollIntoView: vi.fn(),
    onClickEvent: vi.fn(),
    style: {},
    offsetHeight: 0,
  };
  el.createEl = vi.fn(() => makeMockEl());
  el.createDiv = vi.fn(() => makeMockEl());
  el.createSpan = vi.fn(() => makeMockEl());
  return el;
}
