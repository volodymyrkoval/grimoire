import { App, TFile } from 'obsidian';
import type { Spell } from './Spell';
import { spellPath } from './SpellPath';

function tagMatches(tagValue: string, targetTag: string): boolean {
  return tagValue.replace(/^#/, '') === targetTag;
}

function hasTag(app: App, file: TFile, tag: string): boolean {
  const cache = app.metadataCache.getFileCache(file);

  // Check inline tags
  const inlineTags = cache?.tags;
  if (inlineTags && inlineTags.some((t) => tagMatches(t.tag, tag))) {
    return true;
  }

  // Check frontmatter tags
  const frontmatterTags = cache?.frontmatter?.tags as unknown;
  if (frontmatterTags) {
    const tagsArray = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
    if (tagsArray.some((t) => tagMatches(String(t), tag))) {
      return true;
    }
  }

  return false;
}

export function getSpells(app: App, tag: string): Spell[] {
  return app.vault
    .getMarkdownFiles()
    .filter((file) => hasTag(app, file, tag))
    .map((file) => ({
      name: file.basename,
      path: spellPath(file.path),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
