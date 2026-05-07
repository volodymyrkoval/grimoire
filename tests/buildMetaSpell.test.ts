import { describe, it, expect } from 'vitest';
import { buildMetaSpell } from '../src/forge/buildMetaSpell';

describe('buildMetaSpell', () => {
  it('includes description in the output', () => {
    const output = buildMetaSpell({
      description: 'test description here',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('- **Description:** test description here');
  });

  it('includes the sanitised name in the output', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('- **Name (already sanitised):** test-spell');
  });

  it('includes the model in the output', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('- **Model:** claude-sonnet-4-5');
  });

  it('includes effort when effort is set', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('- **Effort:** medium');
  });

  it('shows "n/a" for effort when effort is null', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: null,
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('- **Effort:** n/a');
  });

  it('includes the spell tag in the output', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      spellTag: 'my-spell-tag',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('[my-spell-tag]');
  });

  it('includes the output path with folder and name', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'forges/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('forges/test-spell.md');
  });

  it('includes the vault mount path in the env var section', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'low',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/my/vault/path',
      executeOnNote: true,
    });
    expect(output).toContain('VAULT_MOUNT_PATH');
    expect(output).toContain('/my/vault/path');
  });

  it('includes executeOnNote: true in the output', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'low',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('grimoire-execute-on-note: true');
  });

  it('includes executeOnNote: false in the output', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'low',
      spellTag: 'grimoire/spell',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: false,
    });
    expect(output).toContain('grimoire-execute-on-note: false');
  });

  it('tags instruction still appears after executeOnNote', () => {
    const output = buildMetaSpell({
      description: 'test',
      name: 'test-spell',
      model: 'claude-sonnet-4-5',
      effort: 'low',
      spellTag: 'my-spell-tag',
      forgeOutputFolder: 'Spells/',
      vaultMountPath: '/vault',
      executeOnNote: true,
    });
    expect(output).toContain('[my-spell-tag]');
  });
});
