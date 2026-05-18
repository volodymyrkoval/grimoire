import { describe, it, expect } from 'vitest';
import { buildForgeUpdateUserPrompt } from '../../src/forge/buildForgeUpdateUserPrompt';

describe('buildForgeUpdateUserPrompt', () => {
  it('includes spellPath in the output', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('Spells/my-spell.md');
  });

  it('includes spellName in the output', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('my-spell');
  });

  it('includes model in the output', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('claude-sonnet-4-5');
  });

  it('includes description in the output as quoted block', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell to be better',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('Update this spell to be better');
  });

  it('displays effort when set to medium', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('medium');
  });

  it('displays effort as n/a when effort is null', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: null,
    });
    expect(output).toContain('n/a');
  });

  it('includes applyCastDirectives: true when set to true', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('true');
  });

  it('includes applyCastDirectives: false when set to false', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: false,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('false');
  });

  it('includes directiveCount in the output', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 3,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('3');
  });

  it('references the system prompt workflow', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('Follow the workflow in your system prompt');
  });

  it('does NOT contain currentContent field', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).not.toContain('currentContent');
  });

  it('does NOT contain directives: label as a separate field', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).not.toMatch(/^- \*\*Directives:/m);
  });

  it('applyCastDirectives:true — includes @cast removal instruction', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: true,
      directiveCount: 2,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('Remove all `@cast` lines from the spell body after applying them');
  });

  it('applyCastDirectives:false — includes @cast preserve instruction', () => {
    const output = buildForgeUpdateUserPrompt({
      spellPath: 'Spells/my-spell.md',
      spellName: 'my-spell',
      description: 'Update this spell',
      applyCastDirectives: false,
      directiveCount: 0,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    });
    expect(output).toContain('Preserve all `@cast` lines in the spell body — do not remove them');
    expect(output).not.toContain('Remove all `@cast` lines');
  });
});
