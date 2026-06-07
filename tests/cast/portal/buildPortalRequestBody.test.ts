import { describe, it, expect } from 'vitest';
import { buildPortalRequestBody } from '../../../src/cast/portal/buildPortalRequestBody';
import { CLAUDE_CODE } from '../../../src/domain/settings/Provider';
import type { Effort } from '../../../src/domain/settings/Settings';

describe('buildPortalRequestBody', () => {
  it('builds a JSON request body with all fields', () => {
    const input = {
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      modelId: 'sonnet',
      effort: 'medium' as Effort,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed).toEqual({
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      model: 'sonnet',
      effort: 'medium',
    });
  });

  it('serializes effort as null when effort is null', () => {
    const input = {
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      modelId: 'sonnet',
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
      modelId: 'sonnet',
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
      modelId: 'sonnet',
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
      modelId: 'opus',
      effort: 'high' as Effort,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed).toEqual({
      castId: 'abc-def',
      spellPath: '/grimoire/spells/test',
      userPrompt: 'Test prompt',
      model: 'opus',
      effort: 'high',
    });
  });

  it('includes provider in JSON body when provided', () => {
    const input = {
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      modelId: 'sonnet',
      effort: 'medium' as Effort,
      provider: CLAUDE_CODE,
    };

    const result = buildPortalRequestBody(input);
    const parsed = JSON.parse(result);

    expect(parsed.provider).toBe('claude-code');
    expect(parsed).toEqual({
      castId: 'cast-123',
      spellPath: '/path/to/spell',
      userPrompt: 'Hello, world!',
      model: 'sonnet',
      effort: 'medium',
      provider: 'claude-code',
    });
  });
});
