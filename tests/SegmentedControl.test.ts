// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SegmentedControl } from '../src/ui/widgets/SegmentedControl';

describe('SegmentedControl', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    document.body.removeChild(parent);
  });

  it('(a) Constructor builds N buttons with class grimoire-segmented__btn; initial value button has is-active class', () => {
    const onChange = vi.fn();
    const control = new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'bar',
      onChange,
    });

    const buttons = parent.querySelectorAll('.grimoire-segmented__btn');
    expect(buttons).toHaveLength(3);

    const activeButton = parent.querySelector('.grimoire-segmented__btn.is-active');
    expect(activeButton).not.toBeNull();
    expect(activeButton?.textContent).toBe('bar');
  });

  it('(b) Constructor with value not in options throws error with value in message', () => {
    const onChange = vi.fn();
    expect(() => {
      new SegmentedControl(parent, {
        options: ['foo', 'bar'],
        value: 'invalid',
        onChange,
      });
    }).toThrow("SegmentedControl: value 'invalid' not in options");
  });

  it('(c) Clicking a non-active button: fires onChange(value) once, switches is-active to that button, removes from previous', () => {
    const onChange = vi.fn();
    new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'foo',
      onChange,
    });

    const buttons = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const fooButton = buttons[0];
    const barButton = buttons[1];

    expect(fooButton.classList.contains('is-active')).toBe(true);
    expect(barButton.classList.contains('is-active')).toBe(false);

    barButton.click();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('bar');
    expect(fooButton.classList.contains('is-active')).toBe(false);
    expect(barButton.classList.contains('is-active')).toBe(true);
  });

  it('(d) Clicking the already-active button does NOT fire onChange (no-op)', () => {
    const onChange = vi.fn();
    new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'foo',
      onChange,
    });

    const buttons = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const fooButton = buttons[0];

    fooButton.click();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('(e) ArrowRight keydown from middle button: next button becomes active, onChange fired with next value', () => {
    const onChange = vi.fn();
    new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'bar',
      onChange,
    });

    const buttons = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const barButton = buttons[1];
    const bazButton = buttons[2];

    barButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('baz');
    expect(barButton.classList.contains('is-active')).toBe(false);
    expect(bazButton.classList.contains('is-active')).toBe(true);
  });

  it('(f) ArrowLeft keydown from leftmost button: no-op, onChange NOT fired', () => {
    const onChange = vi.fn();
    new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'foo',
      onChange,
    });

    const buttons = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const fooButton = buttons[0];

    fooButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(fooButton.classList.contains('is-active')).toBe(true);
  });

  it('(g) ArrowRight keydown from rightmost button: no-op, onChange NOT fired (boundary)', () => {
    const onChange = vi.fn();
    new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'baz',
      onChange,
    });

    const buttons = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const bazButton = buttons[2];

    bazButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(bazButton.classList.contains('is-active')).toBe(true);
  });

  it('(h) setValue(next): updates active class without firing onChange', () => {
    const onChange = vi.fn();
    const control = new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'foo',
      onChange,
    });

    const buttons = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const fooButton = buttons[0];
    const barButton = buttons[1];

    control.setValue('bar');

    expect(onChange).not.toHaveBeenCalled();
    expect(fooButton.classList.contains('is-active')).toBe(false);
    expect(barButton.classList.contains('is-active')).toBe(true);
  });

  it('(i) setOptions(newOpts, newValue): clears children and rebuilds; throws if value outside new options', () => {
    const onChange = vi.fn();
    const control = new SegmentedControl(parent, {
      options: ['foo', 'bar'],
      value: 'foo',
      onChange,
    });

    control.setOptions(['a', 'b', 'c'], 'b');

    const buttons = parent.querySelectorAll('.grimoire-segmented__btn');
    expect(buttons).toHaveLength(3);

    const activeButton = parent.querySelector('.grimoire-segmented__btn.is-active');
    expect(activeButton?.textContent).toBe('b');

    // Verify old buttons are gone by checking text content
    const allText = Array.from(buttons).map((b) => b.textContent);
    expect(allText).toEqual(['a', 'b', 'c']);

    // Now test that passing value outside new options throws
    expect(() => {
      control.setOptions(['x', 'y'], 'z');
    }).toThrow("SegmentedControl: value 'z' not in options");
  });

  it('(j) focusSelected(): sets focus to the currently active button', () => {
    const onChange = vi.fn();
    const control = new SegmentedControl(parent, {
      options: ['foo', 'bar', 'baz'],
      value: 'bar',
      onChange,
    });

    const buttons = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const barButton = buttons[1];

    control.focusSelected();

    expect(document.activeElement).toBe(barButton);
  });

  it('(k) setOptions with same options and new value preserves focus on the new active button', () => {
    let emittedValue: string | undefined;
    const control = new SegmentedControl(parent, {
      options: ['low', 'medium', 'high'] as const,
      value: 'low',
      onChange: (v) => {
        emittedValue = v;
        // simulate the reactive subscription: setOptions called with same options + new value
        control.setOptions(['low', 'medium', 'high'] as const, v);
      },
    });

    const buttonsBefore = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const lowButton = buttonsBefore[0];
    const mediumButtonBefore = buttonsBefore[1];

    lowButton.focus();
    lowButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(emittedValue).toBe('medium');

    const buttonsAfter = parent.querySelectorAll(
      '.grimoire-segmented__btn'
    ) as NodeListOf<HTMLButtonElement>;
    const mediumButtonAfter = buttonsAfter[1];

    expect(document.activeElement).toBe(mediumButtonAfter);
    expect(mediumButtonAfter).toBe(mediumButtonBefore);
  });
});
