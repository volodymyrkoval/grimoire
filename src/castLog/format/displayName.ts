import { FORGE_SPELL_PATH, REFINE_SPELL_PATH } from '../../castLog/types';
import type { CastRecord } from '../../castLog/CastRecord';

/**
 * Extracts the display-friendly filename from a file path.
 * Strips .md extension if present.
 */
function getBasename(path: string): string {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  return filename.endsWith('.md') ? filename.slice(0, -3) : filename;
}

/**
 * Resolves a display name for a cast record.
 * For forge casts, returns "Forge: <affected-file>" if files were affected, otherwise "Forge".
 * For live spells, returns the spell's display name (basename without .md extension).
 */
export function resolveDisplayName(record: CastRecord): string {
  if (record.spellPath === FORGE_SPELL_PATH) {
    // Forge cast
    if (record.affectedFiles && record.affectedFiles.length > 0) {
      const basename = getBasename(record.affectedFiles[0]);
      return `Forge: ${basename}`;
    }
    return 'Forge';
  }

  if (record.spellPath === REFINE_SPELL_PATH) {
    return 'Refine';
  }

  return getBasename(record.spellPath);
}
