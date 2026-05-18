import { describe, it, expect } from 'vitest';
import { resolveDisplayName } from '../../../src/castLog/format/displayName';
import { SystemSpellRegistry } from '../../../src/castLog/SystemSpellRegistry';
import type { CastRecord } from '../../../src/castLog/CastRecord';
import { REFINE_SPELL_PATH, FORGE_UPDATE_SPELL_PATH } from '../../../src/domain/spells/SystemSpellPaths';

/** Creates a registry pre-loaded with the three system spell paths. */
function makeRegistry(): SystemSpellRegistry {
  const r = new SystemSpellRegistry();
  r.register('<forge>', { label: 'Forge' });
  r.register(REFINE_SPELL_PATH, { label: 'Refine' });
  r.register(FORGE_UPDATE_SPELL_PATH, { label: 'Forge (update)' });
  return r;
}

describe('resolveDisplayName', () => {
  const baseRecord = {
    castId: 'test-id',
    status: 'done' as const,
    model: 'claude-3-5-sonnet-20241022',
    effort: null,
    contextNotes: [],
    castedTs: '2026-05-14T12:00:00Z',
  };

  it('returns "Forge" when spellPath is FORGE_SPELL_PATH and no affectedFiles', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: '<forge>',
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Forge');
  });

  it('returns "Forge" when spellPath is FORGE_SPELL_PATH and affectedFiles is empty', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: '<forge>',
      affectedFiles: [],
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Forge');
  });

  it('returns "Forge: <basename>" when spellPath is FORGE_SPELL_PATH and has affectedFiles', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: '<forge>',
      affectedFiles: ['path/to/MyNote.md'],
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Forge: MyNote');
  });

  it('returns "Forge: <basename>" with nested paths', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: '<forge>',
      affectedFiles: ['a/b/c/DeepNote.md'],
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Forge: DeepNote');
  });

  it('returns basename of spellPath for live spells', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: 'path/to/MySpell.md',
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('MySpell');
  });

  it('returns basename without .md extension for live spells', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: 'Folder/Another/Spell.md',
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Spell');
  });

  it('handles live spells with no path separators', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: 'SimpleSpell.md',
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('SimpleSpell');
  });

  it('ignores affectedFiles when spellPath is not FORGE_SPELL_PATH', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: 'Spells/LiveSpell.md',
      affectedFiles: ['some/file.md'],
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('LiveSpell');
  });

  it('handles affectedFiles with multiple entries (uses first)', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: '<forge>',
      affectedFiles: ['first.md', 'second.md', 'third.md'],
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Forge: first');
  });

  it('returns "Refine" when spellPath is REFINE_SPELL_PATH', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: REFINE_SPELL_PATH,
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Refine');
  });

  it('returns "Refine" even with affectedFiles (Refine modifies active note, not spell file)', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: REFINE_SPELL_PATH,
      affectedFiles: ['x.md'],
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Refine');
  });

  // F4: FORGE_UPDATE_SPELL_PATH display name
  it('returns "Forge (update)" when spellPath is FORGE_UPDATE_SPELL_PATH', () => {
    const record: CastRecord = {
      ...baseRecord,
      spellPath: FORGE_UPDATE_SPELL_PATH,
    };
    expect(resolveDisplayName(record, makeRegistry())).toBe('Forge (update)');
  });

  it('falls back to basename when spellPath is not in the registry', () => {
    const emptyRegistry = new SystemSpellRegistry();
    const record: CastRecord = {
      ...baseRecord,
      spellPath: REFINE_SPELL_PATH,
    };
    // With no registry entries, sentinel paths fall through to basename
    expect(resolveDisplayName(record, emptyRegistry)).toBe('<refine>');
  });
});
