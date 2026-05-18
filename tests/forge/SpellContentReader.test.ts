import { describe, it, expect } from 'vitest';
import type { SpellContentReader } from '../../src/forge/SpellContentReader';

describe('SpellContentReader', () => {
  it('is a valid interface with read method', () => {
    // This test verifies that SpellContentReader can be imported and has the read method signature
    const mockReader: SpellContentReader = {
      read: async (path) => 'mock content',
    };
    expect(mockReader).toBeDefined();
    expect(typeof mockReader.read).toBe('function');
  });

  it('read method accepts SpellPath and returns Promise<string>', async () => {
    const mockReader: SpellContentReader = {
      read: async (path) => 'spell content',
    };
    const result = await mockReader.read('Spells/test.md' as any);
    expect(result).toBe('spell content');
  });
});
