import { describe, it, expect } from 'vitest';
import { buildPortalRequestBody } from '../../../src/cast/portal/buildPortalRequestBody';
import type { Effort } from '../../../src/domain/settings/Settings';

describe('buildPortalRequestBody', () => {
  it('builds a JSON request body with all fields', () => {
    const input = {
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      modelId: 'claude-sonnet-4-5',
      effort: 'medium' as Effort,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed).toEqual({
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
  });

  it('serializes effort as null when effort is null', () => {
    const input = {
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      modelId: 'claude-sonnet-4-5',
      effort: null,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed.effort).toBeNull();
    expect(parsed).toHaveProperty('effort');
  });

  it('accepts an empty user prompt', () => {
    const input = {
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: '',
      modelId: 'claude-sonnet-4-5',
      effort: null,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed.userPrompt).toBe('');
  });

  it('does not include hooksDir in the JSON body', () => {
    const input = {
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello',
      modelId: 'claude-sonnet-4-5',
      effort: null,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed).not.toHaveProperty('hooksDir');
  });

  it('round-trips: parsed JSON matches the expected object', () => {
    const input = {
      castId: 'abc-def',
      spellPath: '/grimoire/spells/test',
      userPrompt: 'Test prompt',
      modelId: 'claude-opus-4-5',
      effort: 'high' as Effort,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed).toEqual({
      castId: 'abc-def',
      spellPath: '/grimoire/spells/test',
      userPrompt: 'Test prompt',
      model: 'claude-opus-4-5',
      effort: 'high',
    });
  });
});
