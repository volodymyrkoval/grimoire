import { describe, it, expect } from 'vitest';
import { basename } from '../../../src/castLog/format/basename';

describe('basename', () => {
  it('returns "foo.md" for "Notes/foo.md"', () => {
    const result = basename('Notes/foo.md');
    expect(result).toBe('foo.md');
  });

  it('returns "foo.md" for "foo.md"', () => {
    const result = basename('foo.md');
    expect(result).toBe('foo.md');
  });

  it('returns "foo.md" for "Notes/sub/foo.md"', () => {
    const result = basename('Notes/sub/foo.md');
    expect(result).toBe('foo.md');
  });

  it('returns "Notes" for "Notes/" (strip trailing slash, then last segment)', () => {
    const result = basename('Notes/');
    expect(result).toBe('Notes');
  });

  it('returns "" for ""', () => {
    const result = basename('');
    expect(result).toBe('');
  });
});
