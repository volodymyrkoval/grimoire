import type { Spell, Sentinel } from "./Spell";

/**
 * Event map for `SpellsPanel`: emitted when the user activates a spell or sentinel row.
 * - `cast`: user pressed Enter/clicked a spell.
 * - `sentinel`: user pressed Enter/clicked Forge sentinel.
 * - `open-options`: user pressed Right on a spell.
 * - `open-refine-options`: user pressed Right on the Refine sentinel.
 * - `refine-cast`: fired when the Refine sentinel is confirmed and a cast should be dispatched.
 */
export type SpellEvents = {
  cast: Spell;
  sentinel: Sentinel;
  "open-options": Spell;
  "open-refine-options": void;
  "refine-cast": void;
};
