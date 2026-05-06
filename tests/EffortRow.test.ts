// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EffortRow } from '../src/ui/widgets/EffortRow';
import { SUPPORTED_MODELS } from '../src/domain/settings/Settings';

describe('EffortRow', () => {
  let parent: HTMLElement;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.removeChild(parent);
    consoleErrorSpy.mockRestore();
  });

  it('(a) mount with Sonnet (has effortOptions), effort="medium" → appends div.grimoire-effort-row; segmented control inside has buttons for Sonnet options', () => {
    const onChange = vi.fn();
    const row = new EffortRow();

    row.mount(parent, {
      models: SUPPORTED_MODELS,
      modelId: 'claude-sonnet-4-5',
      effort: 'medium',
      onChange,
    });

    // Check that wrapper div was appended
    const wrapper = parent.querySelector('div.grimoire-effort-row');
    expect(wrapper).not.toBeNull();

    // Check that segmented control was created inside wrapper
    const segmented = wrapper?.querySelector('div.grimoire-segmented');
    expect(segmented).not.toBeNull();

    // Check that buttons exist for Sonnet's options: ['low', 'medium', 'high', 'max']
    const buttons = wrapper?.querySelectorAll('.grimoire-segmented__btn');
    expect(buttons).toHaveLength(4);

    // Verify button labels match Sonnet options
    const buttonLabels = Array.from(buttons || []).map((b) => b.textContent);
    expect(buttonLabels).toEqual(['low', 'medium', 'high', 'max']);

    // Verify that 'medium' button has is-active class
    const activeButton = wrapper?.querySelector('.grimoire-segmented__btn.is-active');
    expect(activeButton?.textContent).toBe('medium');
  });

  it('(b) mount with Haiku (effortOptions === null) → NO div.grimoire-effort-row appended to parent', () => {
    const onChange = vi.fn();
    const row = new EffortRow();

    row.mount(parent, {
      models: SUPPORTED_MODELS,
      modelId: 'claude-haiku-4-5',
      effort: null,
      onChange,
    });

    // Parent should remain empty
    const wrapper = parent.querySelector('div.grimoire-effort-row');
    expect(wrapper).toBeNull();
    expect(parent.children.length).toBe(0);
  });

  it('(c) mount with opts.effort === null and a model that has options (Sonnet) → uses model defaultEffort ("medium") as initial value', () => {
    const onChange = vi.fn();
    const row = new EffortRow();

    row.mount(parent, {
      models: SUPPORTED_MODELS,
      modelId: 'claude-sonnet-4-5',
      effort: null, // No effort provided
      onChange,
    });

    // Check that wrapper exists
    const wrapper = parent.querySelector('div.grimoire-effort-row');
    expect(wrapper).not.toBeNull();

    // Check that the active button is 'medium' (Sonnet's defaultEffort)
    const activeButton = wrapper?.querySelector('.grimoire-segmented__btn.is-active');
    expect(activeButton?.textContent).toBe('medium');
  });

  it('(d) mount with model id not in SUPPORTED_MODELS → console.error called, no DOM appended', () => {
    const onChange = vi.fn();
    const row = new EffortRow();

    row.mount(parent, {
      models: SUPPORTED_MODELS,
      modelId: 'invalid-model-id',
      effort: 'medium',
      onChange,
    });

    // console.error should have been called
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'EffortRow.mount: model invalid-model-id not found'
    );

    // No wrapper should be appended
    const wrapper = parent.querySelector('div.grimoire-effort-row');
    expect(wrapper).toBeNull();
    expect(parent.children.length).toBe(0);
  });

  it('(e) update Case 1 — mount Sonnet (effort="medium"), then update to Opus: wrapper still there, segmented now has 5 buttons (Opus options)', () => {
    const onChange = vi.fn();
    const row = new EffortRow();

    // Mount with Sonnet
    row.mount(parent, {
      models: SUPPORTED_MODELS,
      modelId: 'claude-sonnet-4-5',
      effort: 'medium',
      onChange,
    });

    let wrapper = parent.querySelector('div.grimoire-effort-row');
    expect(wrapper).not.toBeNull();

    let buttons = wrapper?.querySelectorAll('.grimoire-segmented__btn');
    expect(buttons).toHaveLength(4); // Sonnet has 4 options

    // Update to Opus
    row.update('claude-opus-4-5', 'medium');

    // Wrapper should still be there (not removed)
    wrapper = parent.querySelector('div.grimoire-effort-row');
    expect(wrapper).not.toBeNull();

    // Buttons should now be 5 (Opus options: ['low', 'medium', 'high', 'xhigh', 'max'])
    buttons = wrapper?.querySelectorAll('.grimoire-segmented__btn');
    expect(buttons).toHaveLength(5);

    const buttonLabels = Array.from(buttons || []).map((b) => b.textContent);
    expect(buttonLabels).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('update Case 2 — mount Sonnet, then update to Haiku: wrapper is removed from DOM', () => {
    const onChange = vi.fn();
    const row = new EffortRow();

    // Mount with Sonnet
    row.mount(parent, {
      models: SUPPORTED_MODELS,
      modelId: 'claude-sonnet-4-5',
      effort: 'medium',
      onChange,
    });

    expect(parent.children.length).toBe(1); // One wrapper div present

    // Update to Haiku (which has no effortOptions) — should unmount the wrapper
    row.update('claude-haiku-4-5', null);

    // No error should be thrown
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // Wrapper should be removed from the DOM
    expect(parent.children.length).toBe(0);
    expect(parent.querySelector('div.grimoire-effort-row')).toBeNull();
  });

  it('(g) Case 3 — mount Haiku (no effort row, but stores parent/models/onChange), then update to Sonnet re-mounts effort row into same parent', () => {
    // Case 3: !#segmented && effortOptions !== null && #parent && #onChange
    // mount() now stores #parent, #models, #onChange before the early return for
    // models with no effortOptions. This enables Case 3 to fire when update() is
    // called with a model that has options.
    const onChange = vi.fn();
    const row = new EffortRow();

    // Mount with Haiku: effortOptions === null → no wrapper, but context stored
    row.mount(parent, {
      models: SUPPORTED_MODELS,
      modelId: 'claude-haiku-4-5',
      effort: null,
      onChange,
    });
    expect(parent.querySelector('.grimoire-effort-row')).toBeNull();

    // update to Sonnet: Case 3 fires → re-mounts effort row into original parent
    row.update('claude-sonnet-4-5', 'medium');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    const wrapper = parent.querySelector('.grimoire-effort-row');
    expect(wrapper).not.toBeNull();
    // Buttons should reflect Sonnet options
    const buttons = wrapper?.querySelectorAll('.grimoire-segmented__btn');
    expect(buttons).toHaveLength(4);
  });

  it('(h) update Case 4 — create EffortRow without mounting; call update with invalid model: console.error, no DOM', () => {
    const onChange = vi.fn();
    const row = new EffortRow();

    // Never mount — #models remains empty array
    // Call update with a model not in the empty #models
    row.update('claude-sonnet-4-5', 'medium');

    // console.error should have been called
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'EffortRow.update: model claude-sonnet-4-5 not found'
    );

    // Parent should still be empty
    expect(parent.children.length).toBe(0);
  });
});
