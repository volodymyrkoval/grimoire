import { FORGE_SPELL_PATH } from '../../domain/spells/SystemSpellPaths';
import type { CastRecord } from '../../castLog/CastRecord';
import type { SystemSpellRegistry } from '../SystemSpellRegistry';

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
 *
 * Special case: Forge casts with affected files render as "Forge: <basename>"
 * to surface the created spell name. All other system spells delegate to the
 * registry's label. Unknown paths fall back to the spell file basename.
 *
 * @param record - The cast record to resolve a name for.
 * @param registry - Registry of system spell labels; injected to avoid hardcoded sentinel checks.
 */
export function resolveDisplayName(record: CastRecord, registry: SystemSpellRegistry): string {
  // Forge with affected files: special label shows the created/updated spell name.
  if (record.spellPath === FORGE_SPELL_PATH && record.affectedFiles && record.affectedFiles.length > 0) {
    const basename = getBasename(record.affectedFiles[0]);
    return `Forge: ${basename}`;
  }

  const meta = registry.describe(record.spellPath);
  if (meta) return meta.label;

  return getBasename(record.spellPath);
}
