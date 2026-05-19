import { App, TFile } from 'obsidian';
import type { Spell } from '../domain/spells/Spell';
import { EXECUTE_ON_NOTE_KEY } from '../domain/spells/Spell';
import { HOTKEY_FRONTMATTER_KEY, parseHotkey } from '../domain/spells/Hotkey';
import { spellPath } from '../domain/spells/SpellPath';
import { isRefineSentinel } from '../refine/refineSentinelScanner';

/** Compares tag values with optional leading # stripped. */
function tagMatches(tagValue: string, targetTag: string): boolean {
  return tagValue.replace(/^#/, '') === targetTag;
}

/** Checks if a file has a given tag in either inline or frontmatter context. */
function hasTag(app: App, file: TFile, tag: string): boolean {
  const cache = app.metadataCache.getFileCache(file);

  const inlineTags = cache?.tags;
  if (inlineTags && inlineTags.some((t) => tagMatches(t.tag, tag))) {
    return true;
  }

  const frontmatterTags = cache?.frontmatter?.tags as unknown;
  if (frontmatterTags) {
    const tagsArray = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
    if (tagsArray.some((t) => tagMatches(String(t), tag))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns all markdown files in the vault tagged with the given spell tag,
 * parsed into Spell objects with execute-on-note settings, sorted by name.
 */
export function getSpells(app: App, tag: string): Spell[] {
  return app.vault
    .getMarkdownFiles()
    .filter((file) => hasTag(app, file, tag))
    // Sentinel-marked notes are excluded from the spell list even if tagged — single discovery mechanism.
    .filter((file) => !isRefineSentinel(app, file))
    .map((file) => {
      const cache = app.metadataCache.getFileCache(file);
      const eonValue: unknown = cache?.frontmatter?.[EXECUTE_ON_NOTE_KEY];
      const executeOnNote = eonValue === true ? true : eonValue === false ? false : true;
      const hotkey = parseHotkey(cache?.frontmatter?.[HOTKEY_FRONTMATTER_KEY]);
      return {
        name: file.basename,
        path: spellPath(file.path),
        executeOnNote,
        hotkey,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
