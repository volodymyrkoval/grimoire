import { App, TFile } from 'obsidian';
import { SENTINEL_FRONTMATTER_KEY, REFINE_SENTINEL_FRONTMATTER_VALUE } from './refineSentinel';

/**
 * Represents a sentinel-marked note (custom Refine spell template).
 * The single discovery mechanism: a note is a Refine template iff it contains
 * `sentinel: refine` in its YAML frontmatter.
 */
export interface RefineSentinelEntry {
  readonly name: string;
  readonly path: string;
}

/**
 * Checks if a file is marked as a custom Refine spell template.
 * A file is a sentinel iff its frontmatter contains `sentinel: refine` (strict string equality).
 *
 * @param app - Obsidian App instance
 * @param file - The file to check
 * @returns true if the file is a Refine sentinel, false otherwise
 */
export function isRefineSentinel(app: App, file: TFile): boolean {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.frontmatter) {
    return false;
  }
  const frontmatterRecord = cache.frontmatter as Record<string, unknown>;
  const sentinelValue = frontmatterRecord[SENTINEL_FRONTMATTER_KEY];
  return sentinelValue === REFINE_SENTINEL_FRONTMATTER_VALUE;
}

/**
 * Returns all sentinel-marked files in the vault (custom Refine spell templates).
 * Results are sorted by basename using case-insensitive comparison.
 *
 * @param app - Obsidian App instance
 * @returns Array of RefineSentinelEntry objects, sorted by name
 */
export function getRefineSentinels(app: App): RefineSentinelEntry[] {
  return app.vault
    .getMarkdownFiles()
    .filter((file) => isRefineSentinel(app, file))
    .map((file) => ({
      name: file.basename,
      path: file.path,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
