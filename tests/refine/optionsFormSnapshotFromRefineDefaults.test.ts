import { describe, it, expect, vi } from 'vitest';
import { optionsFormSnapshotFromRefineDefaults } from '../../src/ui/options/OptionsFormState';
import { SUPPORTED_MODELS } from '../../src/domain/settings/Settings';
import { modelId } from '../../src/domain/settings/ModelId';
import { REFINE_SENTINEL_PATH } from '../../src/domain/spells/Spell';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';

describe('optionsFormSnapshotFromRefineDefaults', () => {
  it('(a) with no override and empty session map, snapshot has defaults and executeOnNote=true', () => {
    const defaults = { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' as const };
    const overrides = new SpellOverrideStore({
      data: { settings: {} as any, spellOverrides: {} },
      saver: { schedule: vi.fn() } as any,
    });
    const sessionMap = new OptionsSessionMap();

    const snapshot = optionsFormSnapshotFromRefineDefaults(defaults, overrides, sessionMap, SUPPORTED_MODELS);

    expect(snapshot.model).toBe('claude-sonnet-4-5');
    expect(snapshot.effort).toBe('medium');
    expect(snapshot.contextNotePaths).toEqual([]);
    expect(snapshot.followUp).toBe('');
    expect(snapshot.executeOnNote).toBe(true);
  });

  it('(b) with override at REFINE_SENTINEL_PATH, snapshot reflects the override', () => {
    const defaults = { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' as const };
    const overrides = new SpellOverrideStore({
      data: {
        settings: {} as any,
        spellOverrides: {
          [REFINE_SENTINEL_PATH]: { model: modelId('claude-opus-4-5'), effort: 'high' },
        },
      },
      saver: { schedule: vi.fn() } as any,
    });
    const sessionMap = new OptionsSessionMap();

    const snapshot = optionsFormSnapshotFromRefineDefaults(defaults, overrides, sessionMap, SUPPORTED_MODELS);

    expect(snapshot.model).toBe('claude-opus-4-5');
    expect(snapshot.effort).toBe('high');
  });

  it('(c) with session-map entry at REFINE_SENTINEL_PATH, snapshot reflects context notes and follow-up', () => {
    const defaults = { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' as const };
    const overrides = new SpellOverrideStore({
      data: { settings: {} as any, spellOverrides: {} },
      saver: { schedule: vi.fn() } as any,
    });
    const sessionMap = new OptionsSessionMap();
    sessionMap.put(REFINE_SENTINEL_PATH, {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: ['foo.md'],
      followUp: 'do it',
      executeOnNote: true,
    });

    const snapshot = optionsFormSnapshotFromRefineDefaults(defaults, overrides, sessionMap, SUPPORTED_MODELS);

    expect(snapshot.contextNotePaths).toEqual(['foo.md']);
    expect(snapshot.followUp).toBe('do it');
  });

  it('(d) executeOnNote is always true regardless of inputs', () => {
    const defaults = { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' as const };
    const overrides = new SpellOverrideStore({
      data: { settings: {} as any, spellOverrides: {} },
      saver: { schedule: vi.fn() } as any,
    });
    const sessionMap = new OptionsSessionMap();
    // Even if we manually set executeOnNote: false in the session, it should be forced true
    sessionMap.put(REFINE_SENTINEL_PATH, {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false, // This should be ignored
    });

    const snapshot = optionsFormSnapshotFromRefineDefaults(defaults, overrides, sessionMap, SUPPORTED_MODELS);

    expect(snapshot.executeOnNote).toBe(true);
  });
});
