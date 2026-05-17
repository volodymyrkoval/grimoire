import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpellOverrideStore } from '../src/domain/settings/SpellOverrideStore';
import { GrimoireData, DEFAULT_SETTINGS } from '../src/domain/settings/Settings';
import { spellPath } from '../src/domain/spells/SpellPath';
import { modelId } from '../src/domain/settings/ModelId';

const makeData = (): GrimoireData => ({
  settings: { ...DEFAULT_SETTINGS },
  spellOverrides: {},
});

describe('SpellOverrideStore', () => {
  let store: SpellOverrideStore;
  let data: GrimoireData;
  let saver: any;

  beforeEach(() => {
    data = makeData();
    saver = { schedule: vi.fn() };
    store = new SpellOverrideStore({ data, saver });
  });

  it('(a) get for unknown path → undefined', () => {
    const path = spellPath('unknown/spell');
    expect(store.get(path)).toBeUndefined();
  });

  it('(b) has for unknown path → false; after set, has → true', () => {
    const path = spellPath('my/spell');
    expect(store.has(path)).toBe(false);

    store.set(path, { model: modelId('claude-sonnet-4-5'), effort: 'medium' });
    expect(store.has(path)).toBe(true);
  });

  it('(c) set valid override (sonnet, medium) → stored in data.spellOverrides[path], saver.schedule() called once', () => {
    const path = spellPath('my/spell');
    store.set(path, { model: modelId('claude-sonnet-4-5'), effort: 'medium' });

    expect(data.spellOverrides[path]).toEqual({
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
    });
    expect(saver.schedule).toHaveBeenCalledTimes(1);
  });

  it('(d) set with unknown model id (gpt-4) → NOT stored, console.error called, saver.schedule() NOT called', () => {
    const path = spellPath('my/spell');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.set(path, { model: modelId('gpt-4'), effort: 'medium' });

    expect(data.spellOverrides[path]).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('Unknown model: gpt-4');
    expect(saver.schedule).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('(e) set for claude-haiku-4-5 (no effort support) → NOT stored, console.error called', () => {
    const path = spellPath('my/spell');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.set(path, { model: modelId('claude-haiku-4-5'), effort: 'medium' });

    expect(data.spellOverrides[path]).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      'Cannot set override for model with no effort support: claude-haiku-4-5'
    );
    expect(saver.schedule).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('(f) set with effort outside model effortOptions (xhigh for sonnet) → stored with effort clamped to defaultEffort (medium)', () => {
    const path = spellPath('my/spell');
    store.set(path, { model: modelId('claude-sonnet-4-5'), effort: 'xhigh' });

    expect(data.spellOverrides[path]).toEqual({
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
    });
    expect(saver.schedule).toHaveBeenCalledTimes(1);
  });

  it('(g) clear for known path → removed from data.spellOverrides, saver.schedule() called', () => {
    const path = spellPath('my/spell');
    data.spellOverrides[path] = { model: modelId('claude-sonnet-4-5'), effort: 'medium' };

    store.clear(path);

    expect(data.spellOverrides[path]).toBeUndefined();
    expect(saver.schedule).toHaveBeenCalledTimes(1);
  });

  it('(h) clear for unknown path → no-op, saver.schedule() NOT called', () => {
    const path = spellPath('unknown/spell');

    store.clear(path);

    expect(saver.schedule).not.toHaveBeenCalled();
  });
});
