import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveSpellOptions,
  ResolveOptionsInput,
} from '../src/domain/settings/spellOptionsResolver';
import { DEFAULT_SETTINGS, SUPPORTED_MODELS, SupportedModel } from '../src/domain/settings/Settings';
import { spellPath } from '../src/domain/spells/SpellPath';
import { modelId } from '../src/domain/settings/ModelId';

describe('spellOptionsResolver.resolveSpellOptions', () => {
  const testSpellPath = spellPath('spells/foo.md');
  let input: ResolveOptionsInput;

  beforeEach(() => {
    const session = { get: vi.fn(() => undefined) } as any;
    const overrides = { get: vi.fn(() => undefined) } as any;

    input = {
      spellPath: testSpellPath,
      session,
      overrides,
      settings: DEFAULT_SETTINGS,
      models: SUPPORTED_MODELS,
    };
  });

  it('(a) returns session entry model & effort when session is present (takes priority)', () => {
    input.session.get = vi.fn(() => ({
      model: modelId('claude-sonnet-4-5'),
      effort: 'high' as const,
      contextNotePaths: [],
      followUp: '',
    }));

    const result = resolveSpellOptions(input);

    expect(result).toEqual({
      model: modelId('claude-sonnet-4-5'),
      effort: 'high',
    });
  });

  it('(b) returns override model & effort when session is absent but override is present', () => {
    input.session.get = vi.fn(() => undefined);
    input.overrides.get = vi.fn(() => ({
      model: modelId('claude-opus-4-5'),
      effort: 'xhigh' as const,
    }));

    const result = resolveSpellOptions(input);

    expect(result).toEqual({
      model: modelId('claude-opus-4-5'),
      effort: 'xhigh',
    });
  });

  it('(c) returns settings defaults when neither session nor override is present', () => {
    input.session.get = vi.fn(() => undefined);
    input.overrides.get = vi.fn(() => undefined);

    const result = resolveSpellOptions(input);

    expect(result).toEqual({
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
    });
  });

  it('(d) falls back to models[0] (Haiku) when selectedModel id is unknown', () => {
    input.session.get = vi.fn(() => undefined);
    input.overrides.get = vi.fn(() => undefined);
    input.settings.defaultModel = modelId('unknown-model');

    const result = resolveSpellOptions(input);

    expect(result).toEqual({
      model: modelId('claude-haiku-4-5'),
      effort: null,
    });
  });

  it('(e) returns selectedEffort when it is in the resolved model\'s effortOptions', () => {
    input.session.get = vi.fn(() => ({
      model: modelId('claude-sonnet-4-5'),
      effort: 'high' as const,
      contextNotePaths: [],
      followUp: '',
    }));

    const result = resolveSpellOptions(input);

    expect(result.effort).toBe('high');
  });

  it('(f) clamps selectedEffort to model\'s defaultEffort when not in effortOptions', () => {
    input.session.get = vi.fn(() => ({
      model: modelId('claude-sonnet-4-5'),
      effort: 'xhigh' as const,
      contextNotePaths: [],
      followUp: '',
    }));

    const result = resolveSpellOptions(input);

    expect(result.effort).toBe('medium');
  });

  it('(g) returns null effort when resolvedModel has effortOptions === null (Haiku)', () => {
    input.session.get = vi.fn(() => ({
      model: modelId('claude-haiku-4-5'),
      effort: 'high' as const,
      contextNotePaths: [],
      followUp: '',
    }));

    const result = resolveSpellOptions(input);

    expect(result).toEqual({
      model: modelId('claude-haiku-4-5'),
      effort: null,
    });
  });
});
