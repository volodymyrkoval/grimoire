import { describe, it, expect } from 'vitest';
import type { Caster, CastInput, CastCallbacks, CastAcceptedInfo } from '../../src/cast/Caster';

describe('Caster types', () => {
  it('exports the expected types', () => {
    // compile-time check: these assignments confirm the types exist and have the right shape
    const _input: CastInput = {
      castId: 'id',
      spellPath: 'spells/foo.md',
      modelId: 'model',
      effort: null,
      userPrompt: 'prompt',
      vaultMountPath: '/vault',
    };
    const _info: CastAcceptedInfo = {};
    const _callbacks: CastCallbacks = {
      onAccepted: (_i: CastAcceptedInfo) => {},
      onFailure: (_m: string) => {},
    };
    const _caster: Caster = {
      cast: (_input: CastInput, _callbacks: CastCallbacks) => {},
    };
    expect(true).toBe(true);
  });
});
