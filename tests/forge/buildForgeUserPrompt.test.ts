import { describe, it, expect } from 'vitest';
import { buildForgeUserPrompt } from '../../src/forge/buildForgeUserPrompt';

describe('buildForgeUserPrompt', () => {
  it('includes description in the output', () => {
    const output = buildForgeUserPrompt({
      description: 'test description here',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('test description here');
  });

  it('includes name in the output', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('test-spell');
  });

  it('includes model in the output', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('sonnet');
  });

  it('displays effort when set to medium', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('medium');
  });

  it('displays effort as n/a when effort is null', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: null,
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('n/a');
  });

  it('includes executeOnNote: true when set to true', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('true');
  });

  it('includes executeOnNote: false when set to false', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: false,
      provider: 'claude-code',
    });
    expect(output).toContain('false');
  });

  it('references the system prompt workflow', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('Follow the workflow in your system prompt');
  });

  it('includes provider in the output', () => {
    const output = buildForgeUserPrompt({
      description: 'test',
      name: 'test-spell',
      model: 'sonnet',
      effort: 'medium',
      executeOnNote: true,
      provider: 'claude-code',
    });
    expect(output).toContain('Provider');
    expect(output).toContain('claude-code');
  });
});
