import type { Spell, Sentinel } from "../domain/spells/Spell";

export type SpellEvents = {
  detail: Spell;
  sentinel: Sentinel;
};
