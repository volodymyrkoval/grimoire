import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { SpellPath } from '../domain/spells/SpellPath';
import type { SpellCastingSettings } from '../domain/settings/CastingSettings';
import { CASTING_FRONTMATTER_KEY, parseCastingSettings } from '../domain/settings/CastingSettings';

/**
 * Reads spell-local casting settings from the grimoire-casting frontmatter block.
 * Returns null if the file doesn't exist, is uncached, lacks the block, or the block is malformed.
 * Never throws.
 */
export type CastingFrontmatterReader = (spellPath: SpellPath) => SpellCastingSettings | null;

/**
 * Writes spell-local casting settings to the grimoire-casting frontmatter block.
 * Updates the file in the vault and triggers metadata cache refresh.
 */
export type CastingFrontmatterWriter = (spellPath: SpellPath, settings: SpellCastingSettings) => Promise<void>;

/**
 * Erases the grimoire-casting frontmatter block from a spell file.
 * Updates the file in the vault and triggers metadata cache refresh.
 */
export type CastingFrontmatterEraser = (spellPath: SpellPath) => Promise<void>;

/**
 * Reads spell-local casting settings from frontmatter.
 * Resolves TFile via app.vault.getAbstractFileByPath(); returns null if not a TFile.
 * Reads app.metadataCache.getFileCache(file)?.frontmatter?.[CASTING_FRONTMATTER_KEY].
 * Passes the raw value through parseCastingSettings and returns the result.
 *
 * Returns null for absent file, uncached file, missing block, or malformed block.
 * Never throws.
 */
export function readCastingFrontmatter(app: App, spellPath: SpellPath): SpellCastingSettings | null {
  const abstractFile = app.vault.getAbstractFileByPath(spellPath);
  if (!(abstractFile instanceof TFile)) {
    return null;
  }

  const cache = app.metadataCache.getFileCache(abstractFile);
  if (!cache?.frontmatter) {
    return null;
  }

  const rawValue = cache.frontmatter[CASTING_FRONTMATTER_KEY] as unknown;
  return parseCastingSettings(rawValue);
}
