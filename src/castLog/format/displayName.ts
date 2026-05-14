import { FORGE_SPELL_PATH } from '../../castLog/types';
import type { CastRecord } from '../../castLog/CastRecord';

function getBasename(path: string): string {
  // Extract the last component after the final /
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  // Remove .md extension if present
  return filename.endsWith('.md') ? filename.slice(0, -3) : filename;
}

export function resolveDisplayName(record: CastRecord): string {
  if (record.spellPath === FORGE_SPELL_PATH) {
    // Forge cast
    if (record.affectedFiles && record.affectedFiles.length > 0) {
      const basename = getBasename(record.affectedFiles[0]);
      return `Forge: ${basename}`;
    }
    return 'Forge';
  }

  // Live spell: return basename without .md
  return getBasename(record.spellPath);
}
