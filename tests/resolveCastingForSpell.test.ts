import { describe, it, expect } from 'vitest';
import { resolveCastingForSpell } from '../src/domain/settings/resolveCastingForSpell';
import { CLAUDE_CODE_PROVIDER } from '../src/domain/settings/CastingSettings';
import { CLAUDE_CODE } from '../src/domain/settings/Provider';
import { SUPPORTED_MODELS } from '../src/domain/settings/Settings';
import { modelId } from '../src/domain/settings/ModelId';

describe('resolveCastingForSpell', () => {
  const defaultModel = modelId('claude-sonnet-4-5');
  const defaultEffort = 'medium' as const;
  const haikuModel = modelId('claude-haiku-4-5');

  it('1: null block returns defaults wholesale', () => {
    const input = {
      parsed: null,
      defaults: { defaultModel, defaultEffort },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    };

    const result = resolveCastingForSpell(input);

    expect(result.model).toBe(defaultModel);
    expect(result.effort).toBe(defaultEffort);
  });

  it('2: stale provider returns defaults wholesale even with model+effort present', () => {
    const input = {
      parsed: {
        provider: 'openai',
        model: haikuModel,
        effort: 'high' as const,
      },
      defaults: { defaultModel, defaultEffort },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    };

    const result = resolveCastingForSpell(input);

    expect(result.model).toBe(defaultModel);
    expect(result.effort).toBe(defaultEffort);
  });

  it('3: matching provider with model+valid effort uses those values', () => {
    const opusModel = modelId('claude-opus-4-5');
    const input = {
      parsed: {
        provider: CLAUDE_CODE_PROVIDER,
        model: opusModel,
        effort: 'xhigh' as const,
      },
      defaults: { defaultModel, defaultEffort },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    };

    const result = resolveCastingForSpell(input);

    expect(result.model).toBe(opusModel);
    expect(result.effort).toBe('xhigh');
  });

  it('4: matching provider, effort omitted, model supports effort → defaults.defaultEffort clamped', () => {
    const sonnetModel = modelId('claude-sonnet-4-5');
    const input = {
      parsed: {
        provider: CLAUDE_CODE_PROVIDER,
        model: sonnetModel,
        // effort omitted (undefined)
      },
      defaults: { defaultModel, defaultEffort },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    };

    const result = resolveCastingForSpell(input);

    expect(result.model).toBe(sonnetModel);
    expect(result.effort).toBe('medium'); // defaults.defaultEffort
  });

  it('5: matching provider, model is Haiku (effortOptions: null) → effort null regardless of defaults', () => {
    const input = {
      parsed: {
        provider: CLAUDE_CODE_PROVIDER,
        model: haikuModel,
        effort: 'high' as const, // even though effort is present, Haiku ignores it
      },
      defaults: { defaultModel, defaultEffort },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    };

    const result = resolveCastingForSpell(input);

    expect(result.model).toBe(haikuModel);
    expect(result.effort).toBeNull();
  });

  it('6: block effort invalid for the block model → clamped to model default', () => {
    const sonnetModel = modelId('claude-sonnet-4-5');
    // Sonnet supports ['low', 'medium', 'high', 'max'], not 'xhigh'
    const input = {
      parsed: {
        provider: CLAUDE_CODE_PROVIDER,
        model: sonnetModel,
        effort: 'xhigh' as const, // invalid for Sonnet
      },
      defaults: { defaultModel: modelId('claude-opus-4-5'), defaultEffort: null },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    };

    const result = resolveCastingForSpell(input);

    expect(result.model).toBe(sonnetModel);
    expect(result.effort).toBe('medium'); // Sonnet's defaultEffort, not the invalid 'xhigh'
  });

  it('7: block model not in supported list → models[0] deprecation fallback', () => {
    const deprecatedModel = modelId('claude-opus-3');
    const input = {
      parsed: {
        provider: CLAUDE_CODE_PROVIDER,
        model: deprecatedModel,
        effort: 'high' as const,
      },
      defaults: { defaultModel, defaultEffort },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    };

    const result = resolveCastingForSpell(input);

    expect(result.model).toBe(SUPPORTED_MODELS[0].id); // Should be Haiku
    expect(result.effort).toBeNull(); // Haiku doesn't support effort
  });

  it('C1: valid claude-code block returns provider: CLAUDE_CODE', () => {
    const opusModel = modelId('claude-opus-4-5');
    const input = {
      parsed: {
        provider: CLAUDE_CODE,
        model: opusModel,
        effort: 'xhigh' as const,
      },
      defaults: { defaultModel, defaultEffort, defaultProvider: CLAUDE_CODE },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE,
    };

    const result = resolveCastingForSpell(input);

    expect(result.provider).toBe(CLAUDE_CODE);
    expect(result.model).toBe(opusModel);
    expect(result.effort).toBe('xhigh');
  });

  it('C2a: parsed is null (wholesale) returns provider: defaults.defaultProvider', () => {
    const input = {
      parsed: null,
      defaults: { defaultModel, defaultEffort, defaultProvider: CLAUDE_CODE },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE,
    };

    const result = resolveCastingForSpell(input);

    expect(result.provider).toBe(CLAUDE_CODE);
    expect(result.model).toBe(defaultModel);
    expect(result.effort).toBe(defaultEffort);
  });

  it('C2b: parsed.provider is stale (mismatch) wholesale fallback returns defaultProvider', () => {
    const input = {
      parsed: {
        provider: 'openai' as any,
        model: modelId('gpt-4'),
        effort: 'high' as const,
      },
      defaults: { defaultModel, defaultEffort, defaultProvider: CLAUDE_CODE },
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE,
    };

    const result = resolveCastingForSpell(input);

    expect(result.provider).toBe(CLAUDE_CODE);
    expect(result.model).toBe(defaultModel);
    expect(result.effort).toBe(defaultEffort);
  });
});
