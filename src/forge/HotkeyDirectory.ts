import type { SpellPath } from '../domain/spells/SpellPath';
import type { Hotkey } from '../domain/spells/Hotkey';
import type { Spell } from '../domain/spells/Spell';

/** Snapshot of hotkeys in use, keyed by SpellPath. */
export interface HotkeyDirectory {
  /** Returns a read-only map of spell paths to their hotkeys. */
  inUse(): ReadonlyMap<SpellPath, Hotkey>;
  /** Returns the name of the spell at the given path, or undefined if not found. */
  nameOf(path: SpellPath): string | undefined;
}

/**
 * Builds a snapshot of hotkeys from a list of spells.
 * Includes only spells where hotkey is not null.
 * Also maintains a parallel map of all spell paths to their names for lookup.
 */
export function buildHotkeyDirectory(spells: readonly Spell[]): HotkeyDirectory {
  const hotkeyMap = new Map<SpellPath, Hotkey>();
  const nameMap = new Map<SpellPath, string>();

  for (const spell of spells) {
    if (spell.hotkey !== null) {
      hotkeyMap.set(spell.path, spell.hotkey);
    }
    nameMap.set(spell.path, spell.name);
  }

  return {
    inUse: () => hotkeyMap,
    nameOf: (path: SpellPath) => nameMap.get(path),
  };
}
