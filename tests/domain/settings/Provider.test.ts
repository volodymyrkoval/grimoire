import { describe, it, expect } from 'vitest';
import {
  parseProvider,
  isKnownProvider,
  KNOWN_PROVIDERS,
  CLAUDE_CODE,
} from '../../../src/domain/settings/Provider';

describe('Provider', () => {
  describe('parseProvider', () => {
    it("returns CLAUDE_CODE when given 'claude-code'", () => {
      expect(parseProvider('claude-code')).toBe(CLAUDE_CODE);
    });

    it('returns null for unknown provider name', () => {
      expect(parseProvider('codex')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseProvider('')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(parseProvider(null)).toBeNull();
    });

    it('returns null for number input', () => {
      expect(parseProvider(42)).toBeNull();
    });

    it('returns null for object input', () => {
      expect(parseProvider({})).toBeNull();
    });
  });

  describe('isKnownProvider', () => {
    it("returns true for 'claude-code'", () => {
      expect(isKnownProvider('claude-code')).toBe(true);
    });

    it('returns false for unknown provider', () => {
      expect(isKnownProvider('nope')).toBe(false);
    });
  });

  describe('KNOWN_PROVIDERS', () => {
    it('contains exactly CLAUDE_CODE with length 1', () => {
      expect(KNOWN_PROVIDERS).toHaveLength(1);
      expect(KNOWN_PROVIDERS[0]).toBe(CLAUDE_CODE);
    });
  });
});
