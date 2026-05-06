import type { Spell, Sentinel } from "../domain/spells/Spell";

/** Event map for `SpellsPanel`: emitted when the user activates a spell or sentinel row. */
export type SpellEvents = {
  cast: Spell;
  sentinel: Sentinel;
};
