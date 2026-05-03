export type SpellPath = string & { readonly __brand: 'SpellPath' };
export function spellPath(value: string): SpellPath { return value as SpellPath; }
