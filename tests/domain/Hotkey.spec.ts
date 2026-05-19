import { describe, it, expect } from 'vitest';
import { parseHotkey, HOTKEY_FRONTMATTER_KEY, SENTINEL_HOTKEYS } from '../../src/domain/spells/Hotkey';

describe('Hotkey', () => {
  describe('parseHotkey', () => {
    it('accepts single lowercase letter', () => {
      expect(parseHotkey('a')).toBe('a');
      expect(parseHotkey('z')).toBe('z');
    });

    it('accepts two lowercase letters', () => {
      expect(parseHotkey('aa')).toBe('aa');
      expect(parseHotkey('zz')).toBe('zz');
      expect(parseHotkey('fo')).toBe('fo');
    });

    it('rejects empty string', () => {
      expect(parseHotkey('')).toBeNull();
    });

    it('rejects uppercase letters', () => {
      expect(parseHotkey('A')).toBeNull();
      expect(parseHotkey('Aa')).toBeNull();
    });

    it('rejects digits', () => {
      expect(parseHotkey('1')).toBeNull();
      expect(parseHotkey('a1')).toBeNull();
    });

    it('rejects three or more letters', () => {
      expect(parseHotkey('abc')).toBeNull();
    });

    it('rejects special characters', () => {
      expect(parseHotkey('a-')).toBeNull();
    });

    it('rejects non-string inputs', () => {
      expect(parseHotkey(null)).toBeNull();
      expect(parseHotkey(undefined)).toBeNull();
      expect(parseHotkey(42)).toBeNull();
      expect(parseHotkey(true)).toBeNull();
      expect(parseHotkey([])).toBeNull();
      expect(parseHotkey({})).toBeNull();
    });
  });

  describe('SENTINEL_HOTKEYS', () => {
    it('forge hotkey is f', () => {
      expect(SENTINEL_HOTKEYS.forge).toBe('f');
    });

    it('refine hotkey is r', () => {
      expect(SENTINEL_HOTKEYS.refine).toBe('r');
    });
  });

  describe('HOTKEY_FRONTMATTER_KEY', () => {
    it('exports the correct frontmatter key', () => {
      expect(HOTKEY_FRONTMATTER_KEY).toBe('grimoire-hotkey');
    });
  });
});
