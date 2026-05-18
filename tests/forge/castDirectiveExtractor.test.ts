import { describe, it, expect } from 'vitest';
import { countCastDirectives, extractCastDirectives } from '../../src/forge/castDirectiveExtractor';

describe('castDirectiveExtractor', () => {
  describe('countCastDirectives', () => {
    it('returns 0 for empty body', () => {
      expect(countCastDirectives('')).toBe(0);
    });

    it('returns 0 when no @cast lines', () => {
      expect(countCastDirectives('Some text\nMore text\nAnother line')).toBe(0);
    });

    it('returns 1 for a single @cast directive line', () => {
      expect(countCastDirectives('@cast tighten the structure')).toBe(1);
    });

    it('returns 2 for multiple @cast directives in order', () => {
      const body = '@cast improve clarity\n@cast add examples';
      expect(countCastDirectives(body)).toBe(2);
    });

    it('does NOT count @casting as @cast', () => {
      expect(countCastDirectives('@casting line')).toBe(0);
    });

    it('does NOT count @castaway as @cast', () => {
      expect(countCastDirectives('@castaway line')).toBe(0);
    });

    it('does NOT count indented @cast lines', () => {
      expect(countCastDirectives('  @cast indented')).toBe(0);
    });

    it('counts @cast with no arguments', () => {
      expect(countCastDirectives('@cast')).toBe(1);
    });
  });

  describe('extractCastDirectives', () => {
    it('returns empty array for empty body', () => {
      expect(extractCastDirectives('')).toEqual([]);
    });

    it('returns empty array when no @cast lines', () => {
      expect(extractCastDirectives('Some text\nMore text')).toEqual([]);
    });

    it('returns single @cast directive', () => {
      expect(extractCastDirectives('@cast tighten the structure')).toEqual(['@cast tighten the structure']);
    });

    it('preserves order of multiple directives', () => {
      const body = '@cast improve clarity\n@cast add examples\n@cast fix grammar';
      expect(extractCastDirectives(body)).toEqual([
        '@cast improve clarity',
        '@cast add examples',
        '@cast fix grammar',
      ]);
    });

    it('does NOT extract @casting lines', () => {
      expect(extractCastDirectives('@casting line')).toEqual([]);
    });

    it('does NOT extract @castaway lines', () => {
      expect(extractCastDirectives('@castaway line')).toEqual([]);
    });

    it('does NOT extract indented @cast lines', () => {
      expect(extractCastDirectives('  @cast indented')).toEqual([]);
    });

    it('extracts @cast with no arguments', () => {
      expect(extractCastDirectives('@cast')).toEqual(['@cast']);
    });

    it('ignores non-directive lines in mixed content', () => {
      const body = 'Some intro text\n@cast first\nRegular content\n@cast second\nMore content';
      expect(extractCastDirectives(body)).toEqual(['@cast first', '@cast second']);
    });
  });
});
