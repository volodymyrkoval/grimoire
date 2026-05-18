import type { Spell } from '../domain/spells/Spell';

export type ForgeMode =
  | { kind: 'create' }
  | {
      kind: 'update';
      spell: Spell;
      directiveCount: number;
    };
