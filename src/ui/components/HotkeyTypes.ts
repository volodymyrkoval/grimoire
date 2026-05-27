import type { Hotkey } from '../../domain/spells/Hotkey';
import type { SpellPath } from '../../domain/spells/SpellPath';

/** Callback to erase a hotkey binding for a spell. */
export type HotkeyEraser = (spellPath: SpellPath) => Promise<void>;

/** Callback to write a hotkey binding to a spell's frontmatter. */
export type HotkeyWriter = (spellPath: SpellPath, hotkey: Hotkey) => Promise<void>;
