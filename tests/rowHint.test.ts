import { describe, it, expect, vi } from 'vitest';
import { appendRowHint } from '../src/ui/components/rowHint';

function makeMockEl(): any {
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

describe('appendRowHint', () => {
  it('appends one span with class spells-row-hint and correct text', () => {
    const el = makeMockEl();

    appendRowHint(el);

    expect(el.createSpan).toHaveBeenCalledWith({
      cls: 'spells-row-hint',
      text: '↵ cast · → options',
    });
    expect(el.createSpan).toHaveBeenCalledTimes(1);
  });
});
