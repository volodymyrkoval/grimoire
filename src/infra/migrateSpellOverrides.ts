import type { TFile } from 'obsidian';
import { CLAUDE_CODE_PROVIDER } from '../domain/settings/CastingSettings';
import type { SpellCastingSettings } from '../domain/settings/CastingSettings';
import type { GrimoireData, SpellOverride } from '../domain/settings/Settings';

/**
 * Injected ports for the one-time spell-override migration.
 * All I/O is abstracted so the function stays testable in the node environment.
 */
export interface MigrateDeps {
  /** Plugin data envelope — mutated in place: migrated and orphaned real-path records are deleted. */
  data: GrimoireData;
  /** Resolves a vault-relative path to a TFile, or null when the file does not exist. */
  resolveFile: (path: string) => TFile | null;
  /** Writes a SpellCastingSettings block to the given file's frontmatter. */
  writeBlock: (file: TFile, settings: SpellCastingSettings) => Promise<void>;
  /** Persists plugin data (e.g. saver.schedule). Called once after the migration loop. */
  persist: () => void;
  /** Returns true when the path is the Refine sentinel — its override stays in the data store. */
  isSentinelPath: (path: string) => boolean;
}

type EntryClassification = 'sentinel' | 'orphan' | { file: TFile };

/**
 * Classifies a spell-override path as sentinel, orphan, or a real resolvable file.
 * Sentinel paths are left intact; orphan paths are dropped without writing.
 */
function classifyEntry(path: string, deps: MigrateDeps): EntryClassification {
  if (deps.isSentinelPath(path)) {
    return 'sentinel';
  }
  const file = deps.resolveFile(path);
  if (file === null) {
    return 'orphan';
  }
  return { file };
}

/**
 * Writes the casting block to the file's frontmatter and removes the record from the data store.
 * Caller is responsible for wrapping this in try/catch.
 */
async function foldEntry(
  path: string,
  override: SpellOverride,
  file: TFile,
  deps: MigrateDeps,
): Promise<void> {
  const settings: SpellCastingSettings = {
    provider: CLAUDE_CODE_PROVIDER,
    model: override.model,
    effort: override.effort,
  };
  await deps.writeBlock(file, settings);
  delete deps.data.spellOverrides[path];
}

/**
 * One-time migration that folds `data.spellOverrides` real-path records into each spell's
 * frontmatter under the `grimoire-casting` key.
 *
 * - Sentinel paths are skipped (their override remains in the data store).
 * - Orphan paths (no backing TFile) are dropped without writing.
 * - If a writeBlock call rejects the record is left intact for a future retry; other entries
 *   continue migrating and the function never throws to the caller.
 * - `persist` is called exactly once after the loop (idempotent when spellOverrides is empty).
 */
export async function migrateSpellOverridesToFrontmatter(deps: MigrateDeps): Promise<void> {
  const entries = Object.entries(deps.data.spellOverrides);

  for (const [path, override] of entries) {
    const classification = classifyEntry(path, deps);

    if (classification === 'sentinel') {
      continue;
    }

    if (classification === 'orphan') {
      delete deps.data.spellOverrides[path];
      continue;
    }

    try {
      await foldEntry(path, override, classification.file, deps);
    } catch (err) {
      console.error(`[grimoire] Failed to migrate spell override for "${path}":`, err);
      // Leave the record intact so a future run retries.
    }
  }

  deps.persist();
}
