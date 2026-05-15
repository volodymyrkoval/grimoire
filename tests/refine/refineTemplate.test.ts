import { describe, it, expect } from 'vitest';
import { renderRefineSystemPrompt } from '../../src/refine/refineTemplate';

describe('renderRefineSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const result = renderRefineSystemPrompt();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains IMMEDIATE EXECUTION callout', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('IMMEDIATE EXECUTION');
  });

  it('contains MCP Tools section', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('MCP Tools');
  });

  it('contains VAULT_MOUNT_PATH for filesystem fallback', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('VAULT_MOUNT_PATH');
  });

  it('contains @cast reference for refine workflow', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('@cast');
  });

  it('contains reference to exiting without modifying if nothing requested', () => {
    const result = renderRefineSystemPrompt();
    const lowerResult = result.toLowerCase();
    expect(
      lowerResult.includes('exit without modifying') ||
      lowerResult.includes('nothing has been requested') ||
      lowerResult.includes('no instructions')
    ).toBe(true);
  });
});
