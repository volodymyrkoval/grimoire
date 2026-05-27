import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFile } from 'obsidian';
import type { MigrateDeps } from '../src/infra/migrateSpellOverrides';
import { migrateSpellOverridesToFrontmatter } from '../src/infra/migrateSpellOverrides';
import { modelId } from '../src/domain/settings/ModelId';
import type { GrimoireData } from '../src/domain/settings/Settings';

/** Minimal TFile stand-in — tests only pass it through as an opaque handle. */
function makeFakeFile(path: string): TFile {
  return { path } as unknown as TFile;
}

function makeData(overrides: GrimoireData['spellOverrides']): GrimoireData {
  return {
    settings: {} as GrimoireData['settings'],
    spellOverrides: { ...overrides },
  };
}

describe('migrateSpellOverridesToFrontmatter', () => {
  let writeBlock: ReturnType<typeof vi.fn>;
  let persist: ReturnType<typeof vi.fn>;
  let resolveFile: ReturnType<typeof vi.fn>;
  let isSentinelPath: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeBlock = vi.fn().mockResolvedValue(undefined);
    persist = vi.fn();
    resolveFile = vi.fn().mockReturnValue(null);
    isSentinelPath = vi.fn().mockReturnValue(false);
  });

  it('calls writeBlock with provider/model/effort and deletes the record for a resolvable real-path entry', async () => {
    const file = makeFakeFile('spells/test.md');
    resolveFile.mockReturnValue(file);
    const data = makeData({
      'spells/test.md': { model: modelId('claude-sonnet-4-5'), effort: 'high' },
    });
    const deps: MigrateDeps = { data, resolveFile, writeBlock, persist, isSentinelPath };

    await migrateSpellOverridesToFrontmatter(deps);

    expect(writeBlock).toHaveBeenCalledOnce();
    expect(writeBlock).toHaveBeenCalledWith(file, {
      provider: 'claude-code',
      model: 'claude-sonnet-4-5',
      effort: 'high',
    });
    expect(data.spellOverrides).not.toHaveProperty('spells/test.md');
  });

  it('deletes the record without calling writeBlock when resolveFile returns null (orphan)', async () => {
    resolveFile.mockReturnValue(null);
    const data = makeData({
      'spells/orphan.md': { model: modelId('claude-haiku-4-5'), effort: 'low' },
    });
    const deps: MigrateDeps = { data, resolveFile, writeBlock, persist, isSentinelPath };

    await migrateSpellOverridesToFrontmatter(deps);

    expect(writeBlock).not.toHaveBeenCalled();
    expect(data.spellOverrides).not.toHaveProperty('spells/orphan.md');
  });

  it('leaves the record untouched and does not call writeBlock for a sentinel path', async () => {
    isSentinelPath.mockReturnValue(true);
    const data = makeData({
      '__refine_sentinel__': { model: modelId('claude-sonnet-4-5'), effort: 'medium' },
    });
    const deps: MigrateDeps = { data, resolveFile, writeBlock, persist, isSentinelPath };

    await migrateSpellOverridesToFrontmatter(deps);

    expect(writeBlock).not.toHaveBeenCalled();
    expect(data.spellOverrides).toHaveProperty('__refine_sentinel__');
  });

  it('calls persist exactly once after the loop regardless of how many entries are processed', async () => {
    const file1 = makeFakeFile('spells/a.md');
    const file2 = makeFakeFile('spells/b.md');
    resolveFile.mockImplementation((p: string) =>
      p === 'spells/a.md' ? file1 : p === 'spells/b.md' ? file2 : null,
    );
    const data = makeData({
      'spells/a.md': { model: modelId('claude-sonnet-4-5'), effort: 'low' },
      'spells/b.md': { model: modelId('claude-opus-4-5'), effort: 'high' },
    });
    const deps: MigrateDeps = { data, resolveFile, writeBlock, persist, isSentinelPath };

    await migrateSpellOverridesToFrontmatter(deps);

    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not call writeBlock and does not throw when spellOverrides is empty (idempotent)', async () => {
    const data = makeData({});
    const deps: MigrateDeps = { data, resolveFile, writeBlock, persist, isSentinelPath };

    await expect(migrateSpellOverridesToFrontmatter(deps)).resolves.toBeUndefined();

    expect(writeBlock).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('leaves the failing record intact while still migrating other entries and not throwing when writeBlock rejects', async () => {
    const goodFile = makeFakeFile('spells/good.md');
    const badFile = makeFakeFile('spells/bad.md');
    resolveFile.mockImplementation((p: string) => {
      if (p === 'spells/good.md') return goodFile;
      if (p === 'spells/bad.md') return badFile;
      return null;
    });
    writeBlock.mockImplementation(async (file: TFile) => {
      if (file === badFile) throw new Error('write failed');
    });
    const data = makeData({
      'spells/bad.md': { model: modelId('claude-sonnet-4-5'), effort: 'medium' },
      'spells/good.md': { model: modelId('claude-haiku-4-5'), effort: 'low' },
    });
    const deps: MigrateDeps = { data, resolveFile, writeBlock, persist, isSentinelPath };

    await expect(migrateSpellOverridesToFrontmatter(deps)).resolves.toBeUndefined();

    // Failing record survives
    expect(data.spellOverrides).toHaveProperty('spells/bad.md');
    // Successful record is deleted
    expect(data.spellOverrides).not.toHaveProperty('spells/good.md');
    // persist still called
    expect(persist).toHaveBeenCalledOnce();
  });
});
