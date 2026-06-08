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

    store.set(path, { model: modelId('sonnet'), effort: 'medium' });
    expect(store.has(path)).toBe(true);
  });

  it('(c) set valid override (sonnet, medium) → stored in data.spellOverrides[path], saver.schedule() called once', () => {
    const path = spellPath('my/spell');
    store.set(path, { model: modelId('sonnet'), effort: 'medium' });

    expect(data.spellOverrides[path]).toEqual({
      model: modelId('sonnet'),
      effort: 'medium',
    });
    expect(saver.schedule).toHaveBeenCalledTimes(1);
  });

  it('(d) set with unknown model id → injected logger.error() called, not console.error', () => {
    const path = spellPath('my/spell');
    const mockLogger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const storeWithLogger = new SpellOverrideStore({ data, saver, logger: mockLogger as any });

    storeWithLogger.set(path, { model: modelId('gpt-4'), effort: 'medium' });

    expect(mockLogger.error).toHaveBeenCalledWith('Unknown model: gpt-4');
    expect(data.spellOverrides[path]).toBeUndefined();
    expect(saver.schedule).not.toHaveBeenCalled();
  });

  it('(e) set for haiku (no effort support) → injected logger.error() called', () => {
    const path = spellPath('my/spell');
    const mockLogger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const storeWithLogger = new SpellOverrideStore({ data, saver, logger: mockLogger as any });

    storeWithLogger.set(path, { model: modelId('haiku'), effort: 'medium' });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Cannot set override for model with no effort support: haiku'
    );
    expect(data.spellOverrides[path]).toBeUndefined();
    expect(saver.schedule).not.toHaveBeenCalled();
  });

  it('(f) set with effort outside model effortOptions (xhigh for sonnet) → stored with effort clamped to defaultEffort (medium)', () => {
    const path = spellPath('my/spell');
    store.set(path, { model: modelId('sonnet'), effort: 'xhigh' });

    expect(data.spellOverrides[path]).toEqual({
      model: modelId('sonnet'),
      effort: 'medium',
    });
    expect(saver.schedule).toHaveBeenCalledTimes(1);
  });

  it('(g) clear for known path → removed from data.spellOverrides, saver.schedule() called', () => {
    const path = spellPath('my/spell');
    data.spellOverrides[path] = { model: modelId('sonnet'), effort: 'medium' };

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
