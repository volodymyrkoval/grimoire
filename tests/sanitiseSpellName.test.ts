import { describe, it, expect } from 'vitest';
import { sanitiseSpellName } from '../src/forge/sanitiseSpellName';

describe('sanitiseSpellName', () => {
  it('returns empty string for empty input', () => {
    expect(sanitiseSpellName('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitiseSpellName('  \t\n  ')).toBe('');
  });

  it('replaces all illegal chars (<>:"/\\|?*) with dashes', () => {
    expect(sanitiseSpellName('<>:"/\\|?*')).toBe('');
  });

  it('replaces control characters (\\x00-\\x1f) with dashes', () => {
    expect(sanitiseSpellName('a\x00b\x1fc')).toBe('a-b-c');
  });

  it('collapses runs of dashes to a single dash', () => {
    expect(sanitiseSpellName('a--b---c----d')).toBe('a-b-c-d');
  });

  it('trims leading and trailing dashes', () => {
    expect(sanitiseSpellName('-abc-')).toBe('abc');
  });

  it('trims leading dashes', () => {
    expect(sanitiseSpellName('---abc')).toBe('abc');
  });

  it('trims trailing dashes', () => {
    expect(sanitiseSpellName('abc---')).toBe('abc');
  });

  it('handles mixed legal and illegal characters', () => {
    expect(sanitiseSpellName('my<spell')).toBe('my-spell');
  });

  it('handles complex case with all transformations', () => {
    expect(sanitiseSpellName('---my<weird|spell---')).toBe('my-weird-spell');
  });
});
