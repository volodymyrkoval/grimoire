import { describe, it, expect } from 'vitest';
import { appendRowHint } from '../src/ui/components/rowHint';
import { makeMockEl } from './helpers/mockEl';

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
