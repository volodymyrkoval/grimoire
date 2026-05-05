import { describe, it, expect } from 'vitest';
import { snapshotEqualsCurrent, OptionsSnapshot } from '../src/ui/options/OptionsSnapshot';
import { OptionsFormSnapshot } from '../src/ui/options/OptionsFormState';

describe('snapshotEqualsCurrent', () => {
  // (a) Equal model AND effort returns true
  it('equal model and effort returns true', () => {
    const snap: OptionsSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    };
    const current: OptionsFormSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
    };

    const result = snapshotEqualsCurrent(snap, current);

    expect(result).toBe(true);
  });

  // (b) Mismatched model returns false
  it('mismatched model returns false', () => {
    const snap: OptionsSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    };
    const current: OptionsFormSnapshot = {
      model: 'claude-opus-4-5',
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
    };

    const result = snapshotEqualsCurrent(snap, current);

    expect(result).toBe(false);
  });

  // (c) Mismatched effort returns false
  it('mismatched effort returns false', () => {
    const snap: OptionsSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
    };
    const current: OptionsFormSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: 'high',
      contextNotePaths: [],
      followUp: '',
    };

    const result = snapshotEqualsCurrent(snap, current);

    expect(result).toBe(false);
  });

  // (d) effort null vs 'medium' returns false
  it('effort null vs medium returns false', () => {
    const snap: OptionsSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: null,
    };
    const current: OptionsFormSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
    };

    const result = snapshotEqualsCurrent(snap, current);

    expect(result).toBe(false);
  });

  // (e) Both efforts null returns true
  it('both efforts null returns true', () => {
    const snap: OptionsSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: null,
    };
    const current: OptionsFormSnapshot = {
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
    };

    const result = snapshotEqualsCurrent(snap, current);

    expect(result).toBe(true);
  });
});
