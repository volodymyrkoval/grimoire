import { describe, it, expect, vi } from 'vitest';
import { appendRowHint } from '../src/ui/components/rowHint';
import { makeMockEl } from './helpers/mockEl';

describe('appendRowHint', () => {
  it('appends a single spells-row-hint wrapper span to the container', () => {
    const el = makeMockEl();

    appendRowHint(el);

    // Only one direct child appended — the wrapper that carries spells-row-hint
    expect(el.createSpan).toHaveBeenCalledTimes(1);
    expect(el.createSpan).toHaveBeenCalledWith({ cls: 'spells-row-hint' });
  });

  it('nests cast span and options chip inside the wrapper, not el directly', () => {
    const wrapper = makeMockEl();
    const el = makeMockEl();
    el.createSpan.mockReturnValueOnce(wrapper);

    appendRowHint(el);

    // Both children are created on the wrapper, not on el
    expect(wrapper.createSpan).toHaveBeenCalledTimes(2);
    expect(wrapper.createSpan).toHaveBeenNthCalledWith(1, {
      cls: 'spells-row-hint-cast',
      text: '↵ cast · ',
    });
    expect(wrapper.createSpan).toHaveBeenNthCalledWith(2, {
      cls: 'grimoire-options-chip',
    });
  });

  it('sets role=button and tabindex=-1 on options chip', () => {
    const wrapper = makeMockEl();
    const optionsChip = makeMockEl();
    const el = makeMockEl();
    el.createSpan.mockReturnValueOnce(wrapper);
    wrapper.createSpan.mockReturnValueOnce(makeMockEl()).mockReturnValueOnce(optionsChip);

    appendRowHint(el);

    expect(optionsChip.setAttribute).toHaveBeenCalledWith('role', 'button');
    expect(optionsChip.setAttribute).toHaveBeenCalledWith('tabindex', '-1');
  });

  it('renders options text in the chip and calls callback on click', () => {
    const wrapper = makeMockEl();
    const optionsChip = makeMockEl();
    const el = makeMockEl();
    el.createSpan.mockReturnValueOnce(wrapper);
    wrapper.createSpan.mockReturnValueOnce(makeMockEl()).mockReturnValueOnce(optionsChip);
    const onOptionsClick = vi.fn();

    appendRowHint(el, onOptionsClick);

    // Verify text content set on chip
    expect(optionsChip.createSpan).toHaveBeenCalledWith({
      text: '→ options',
    });

    // Simulate click on the chip
    const onClickCalls = optionsChip.addEventListener.mock.calls.filter(
      (call: any[]) => call[0] === 'click'
    );
    expect(onClickCalls).toHaveLength(1);
    const clickHandler = onClickCalls[0][1];

    const mockEvent = { stopPropagation: vi.fn() };
    clickHandler(mockEvent);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(onOptionsClick).toHaveBeenCalled();
  });
});
