import { parseHotkey, FORGE_SENTINEL_KEY, REFINE_SENTINEL_KEY } from '../domain/spells/Hotkey';
import type { Hotkey } from '../domain/spells/Hotkey';
import type { SpellPath } from '../domain/spells/SpellPath';
import type { HotkeyDirectory } from './HotkeyDirectory';

/**
 * Result of attempting to commit a hotkey candidate.
 * Either success with the validated Hotkey, or failure with a reason and optional context.
 */
export type HotkeyCommitResult =
  | { ok: true; hotkey: Hotkey }
  | {
      ok: false;
      reason: 'pattern' | 'reserved-forge' | 'reserved-refine' | 'collision';
      collidingSpellName?: string;
    };

/**
 * Validates a hotkey candidate against pattern, reserved letters, and collision rules.
 * @param candidate The raw string to validate
 * @param selfPath The SpellPath of the spell being edited (or null in create mode).
 *                 If provided, this path is excluded from the collision check.
 * @param directory The HotkeyDirectory snapshot containing all spells' hotkeys and names.
 * @returns A HotkeyCommitResult indicating success or the reason for failure.
 */
export function validateHotkeyCommit(
  candidate: string,
  selfPath: SpellPath | null,
  directory: HotkeyDirectory,
): HotkeyCommitResult {
  // 1. Pattern check: must be a valid hotkey (1-2 lowercase letters)
  const parsed = parseHotkey(candidate);
  if (parsed === null) {
    return { ok: false, reason: 'pattern' };
  }

  // 2. Reserved-Forge check
  if (candidate === FORGE_SENTINEL_KEY) {
    return { ok: false, reason: 'reserved-forge' };
  }

  // 3. Reserved-Refine check
  if (candidate === REFINE_SENTINEL_KEY) {
    return { ok: false, reason: 'reserved-refine' };
  }

  // 4. Collision check: iterate the directory and find if another spell already uses this hotkey
  for (const [path, hotkey] of directory.inUse()) {
    if (hotkey === candidate && path !== selfPath) {
      return {
        ok: false,
        reason: 'collision',
        collidingSpellName: directory.nameOf(path),
      };
    }
  }

  // All checks passed
  return { ok: true, hotkey: parsed };
}
