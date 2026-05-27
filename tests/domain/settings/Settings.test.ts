import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SUPPORTED_MODELS } from '../../../src/domain/settings/Settings';
import { CLAUDE_CODE } from '../../../src/domain/settings/Provider';

describe('Settings', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('DEFAULT_SETTINGS.defaultProvider === CLAUDE_CODE', () => {
      expect(DEFAULT_SETTINGS.defaultProvider).toBe(CLAUDE_CODE);
    });
  });

  describe('SUPPORTED_MODELS', () => {
    it('every SUPPORTED_MODELS entry has provider === CLAUDE_CODE', () => {
      for (const model of SUPPORTED_MODELS) {
        expect(model.provider).toBe(CLAUDE_CODE);
      }
    });
  });
});
