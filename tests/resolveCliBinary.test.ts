import { describe, it, expect } from 'vitest';
import { resolveCliBinary } from '../src/cast/resolveCliBinary';

describe('resolveCliBinary', () => {
  it('returns binaryPath when it is non-empty', () => {
    const result = resolveCliBinary({
      binaryPath: '/usr/local/bin/claude',
      cliCommand: 'claude',
    });
    expect(result).toBe('/usr/local/bin/claude');
  });

  it('returns cliCommand when binaryPath is empty', () => {
    const result = resolveCliBinary({
      binaryPath: '',
      cliCommand: 'claude',
    });
    expect(result).toBe('claude');
  });

  it('returns empty string when both are empty', () => {
    const result = resolveCliBinary({
      binaryPath: '',
      cliCommand: '',
    });
    expect(result).toBe('');
  });

  it('prefers binaryPath even when cliCommand is also set', () => {
    const result = resolveCliBinary({
      binaryPath: '/opt/bin/claude',
      cliCommand: 'claude',
    });
    expect(result).toBe('/opt/bin/claude');
  });
});
