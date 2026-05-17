import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptionsFormState, OptionsFormSnapshot } from '../src/ui/options/OptionsFormState';
import { SUPPORTED_MODELS } from '../src/domain/settings/Settings';
import { modelId } from '../src/domain/settings/ModelId';

describe('OptionsFormState', () => {
  let initialSnapshot: OptionsFormSnapshot;

  beforeEach(() => {
    initialSnapshot = {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };
  });

  it('stores initial snapshot in constructor', () => {
    const state = new OptionsFormState(initialSnapshot);
    const snap = state.snapshot();

    expect(snap.model).toBe('claude-sonnet-4-5');
    expect(snap.effort).toBe('medium');
    expect(snap.contextNotePaths).toEqual([]);
    expect(snap.followUp).toBe('');
  });

  it('setEffort updates effort and fires onChange once', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();

    state.onChange(listener);
    state.setEffort('high');

    expect(state.snapshot().effort).toBe('high');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setModel to Opus preserves effort when in effortOptions', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();

    state.onChange(listener);
    const result = state.setModel(modelId('claude-opus-4-5'), SUPPORTED_MODELS);

    expect(state.snapshot().effort).toBe('medium');
    expect(result).toBe('medium');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setModel to Sonnet falls back to defaultEffort when current effort not in options', () => {
    const stateSnapshot: OptionsFormSnapshot = {
      model: modelId('claude-opus-4-5'),
      effort: 'xhigh',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };
    const state = new OptionsFormState(stateSnapshot);
    const listener = vi.fn();

    state.onChange(listener);
    const result = state.setModel(modelId('claude-sonnet-4-5'), SUPPORTED_MODELS);

    expect(state.snapshot().effort).toBe('medium');
    expect(result).toBe('medium');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setModel to Haiku sets effort to null', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();

    state.onChange(listener);
    const result = state.setModel(modelId('claude-haiku-4-5'), SUPPORTED_MODELS);

    expect(state.snapshot().effort).toBeNull();
    expect(result).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setModel with unknown id falls back to models[0] and warns', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    state.onChange(listener);
    const result = state.setModel(modelId('unknown-model-id'), SUPPORTED_MODELS);

    expect(state.snapshot().model).toBe('claude-haiku-4-5');
    expect(state.snapshot().effort).toBeNull();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('unknown-model-id');
    expect(listener).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('setContextNotePaths updates contextNotePaths and fires onChange', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();

    state.onChange(listener);
    state.setContextNotePaths(['a.md']);

    expect(state.snapshot().contextNotePaths).toEqual(['a.md']);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setFollowUp updates followUp and fires onChange', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();

    state.onChange(listener);
    state.setFollowUp('hi');

    expect(state.snapshot().followUp).toBe('hi');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('onChange returns unsubscribe function that stops emissions', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();

    const unsubscribe = state.onChange(listener);
    state.setEffort('high');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    state.setEffort('low');
    expect(listener).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('snapshot returns fresh array for contextNotePaths', () => {
    const state = new OptionsFormState({
      ...initialSnapshot,
      contextNotePaths: ['original.md'],
    });

    const snap1 = state.snapshot();
    snap1.contextNotePaths.push('mutated.md');

    const snap2 = state.snapshot();
    expect(snap2.contextNotePaths).toEqual(['original.md']);
    expect(snap2.contextNotePaths).not.toContain('mutated.md');
  });

  it('stores initial executeOnNote in constructor', () => {
    const state = new OptionsFormState({
      ...initialSnapshot,
      executeOnNote: false,
    });

    expect(state.snapshot().executeOnNote).toBe(false);
  });

  it('setExecuteOnNote updates executeOnNote and fires onChange once', () => {
    const state = new OptionsFormState(initialSnapshot);
    const listener = vi.fn();

    state.onChange(listener);
    state.setExecuteOnNote(false);

    expect(state.snapshot().executeOnNote).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setExecuteOnNote(true) updates executeOnNote to true', () => {
    const state = new OptionsFormState({
      ...initialSnapshot,
      executeOnNote: false,
    });

    state.setExecuteOnNote(true);

    expect(state.snapshot().executeOnNote).toBe(true);
  });
});
