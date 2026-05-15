/** Branded type for vault file paths that refer to spells. */
export type SpellPath = string & { readonly __brand: 'SpellPath' };

/** Safe constructor for SpellPath brand. */
export function spellPath(value: string): SpellPath { return value as SpellPath; }
