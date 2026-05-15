import { App, TFile } from 'obsidian';
import type { Spell } from './Spell';
import { EXECUTE_ON_NOTE_KEY } from './Spell';
import { spellPath } from './SpellPath';

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
    .map((file) => {
      const cache = app.metadataCache.getFileCache(file);
      const eonValue: unknown = cache?.frontmatter?.[EXECUTE_ON_NOTE_KEY];
      const executeOnNote = eonValue === true ? true : eonValue === false ? false : true;
      return {
        name: file.basename,
        path: spellPath(file.path),
        executeOnNote,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
