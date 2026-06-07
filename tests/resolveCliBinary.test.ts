import { describe, it, expect } from 'vitest';
import { resolveCliBinary } from '../src/cast/local/resolveCliBinary';

describe('resolveCliBinary', () => {
  it('returns binaryPath when it is non-empty', () => {
    const result = resolveCliBinary({ binaryPath: '/usr/local/bin/claude' });
    expect(result).toBe('/usr/local/bin/claude');
  });

  it('returns empty string when binaryPath is empty', () => {
    const result = resolveCliBinary({ binaryPath: '' });
    expect(result).toBe('');
  });
});
