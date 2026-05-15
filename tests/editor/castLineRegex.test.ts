import { describe, it, expect } from 'vitest';
import { CAST_LINE_REGEX } from '../../src/editor/castLineRegex';

describe('CAST_LINE_REGEX', () => {
  it('matches bare @cast at end of line', () => {
    expect(CAST_LINE_REGEX.test('@cast')).toBe(true);
  });

  it('matches @cast followed by space and text', () => {
    expect(CAST_LINE_REGEX.test('@cast foo')).toBe(true);
  });

  it('matches @cast followed by tab', () => {
    expect(CAST_LINE_REGEX.test('@cast\t')).toBe(true);
  });

  it('does not match @casting (word boundary fails)', () => {
    expect(CAST_LINE_REGEX.test('@casting')).toBe(false);
  });

  it('does not match @castaway (word boundary fails)', () => {
    expect(CAST_LINE_REGEX.test('@castaway')).toBe(false);
  });

  it('does not match @CAST (case sensitive)', () => {
    expect(CAST_LINE_REGEX.test('@CAST')).toBe(false);
  });

  it('does not match @cast with leading space (anchor fails)', () => {
    expect(CAST_LINE_REGEX.test(' @cast')).toBe(false);
  });

  it('does not match @cast in middle of line (anchor fails)', () => {
    expect(CAST_LINE_REGEX.test('text @cast')).toBe(false);
  });
});
