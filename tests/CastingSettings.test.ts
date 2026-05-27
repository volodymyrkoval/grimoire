import { describe, it, expect } from 'vitest';
import {
  CASTING_FRONTMATTER_KEY,
  CLAUDE_CODE_PROVIDER,
  parseCastingSettings,
  type SpellCastingSettings,
} from '../src/domain/settings/CastingSettings';
import { modelId } from '../src/domain/settings/ModelId';

describe('CastingSettings', () => {
  describe('constants', () => {
    it('CASTING_FRONTMATTER_KEY equals grimoire-casting', () => {
      expect(CASTING_FRONTMATTER_KEY).toBe('grimoire-casting');
    });

    it('CLAUDE_CODE_PROVIDER equals claude-code', () => {
      expect(CLAUDE_CODE_PROVIDER).toBe('claude-code');
    });
  });

  describe('parseCastingSettings', () => {
    it('parses well-formed object with provider, model, and effort', () => {
      const raw = { provider: 'claude-code', model: 'claude-sonnet-4-5', effort: 'high' };
      const result = parseCastingSettings(raw);

      expect(result).toEqual({
        provider: 'claude-code',
        model: modelId('claude-sonnet-4-5'),
        effort: 'high',
      });
    });

    it('parses object with effort omitted', () => {
      const raw = { provider: 'claude-code', model: 'claude-sonnet-4-5' };
      const result = parseCastingSettings(raw);

      expect(result).toEqual({
        provider: 'claude-code',
        model: modelId('claude-sonnet-4-5'),
        effort: undefined,
      });
    });

    it('returns null when model is missing', () => {
      const raw = { provider: 'claude-code' };
      const result = parseCastingSettings(raw);

      expect(result).toBeNull();
    });

    it('returns null when provider is missing', () => {
      const raw = { model: 'claude-sonnet-4-5' };
      const result = parseCastingSettings(raw);

      expect(result).toBeNull();
    });

    it('returns null when provider is empty string', () => {
      const raw = { provider: '', model: 'claude-sonnet-4-5' };
      const result = parseCastingSettings(raw);

      expect(result).toBeNull();
    });

    it('returns null when provider is whitespace only', () => {
      const raw = { provider: '   ', model: 'claude-sonnet-4-5' };
      const result = parseCastingSettings(raw);

      expect(result).toBeNull();
    });

    it('returns null when model is empty string', () => {
      const raw = { provider: 'claude-code', model: '' };
      const result = parseCastingSettings(raw);

      expect(result).toBeNull();
    });

    it('returns null when raw is a string', () => {
      const result = parseCastingSettings('not an object');

      expect(result).toBeNull();
    });

    it('returns null when raw is a number', () => {
      const result = parseCastingSettings(42);

      expect(result).toBeNull();
    });

    it('returns null when raw is null', () => {
      const result = parseCastingSettings(null);

      expect(result).toBeNull();
    });

    it('returns null when raw is an array', () => {
      const result = parseCastingSettings(['claude-code', 'claude-sonnet-4-5']);

      expect(result).toBeNull();
    });

    it('parses object with unknown effort string as undefined', () => {
      const raw = { provider: 'claude-code', model: 'claude-sonnet-4-5', effort: 'unknown' };
      const result = parseCastingSettings(raw);

      expect(result).toEqual({
        provider: 'claude-code',
        model: modelId('claude-sonnet-4-5'),
        effort: undefined,
      });
    });

    it('trims whitespace from provider', () => {
      const raw = { provider: '  claude-code  ', model: 'claude-sonnet-4-5' };
      const result = parseCastingSettings(raw);

      expect(result).toEqual({
        provider: 'claude-code',
        model: modelId('claude-sonnet-4-5'),
        effort: undefined,
      });
    });
  });
});
