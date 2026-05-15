import { describe, it, expect } from 'vitest';
import {
  optionsFormSnapshotFromDefaults,
  type OptionsFormSnapshot,
} from '../src/ui/options/OptionsFormState';
import type { FormDefaults } from '../src/domain/settings/FormDefaults';
import type { Spell } from '../src/domain/spells/Spell';

describe('optionsFormSnapshotFromDefaults', () => {
  it('creates a snapshot with medium effort from defaults', () => {
    const defaults: FormDefaults = {
      defaultModel: 'claude-opus',
      defaultEffort: 'medium',
    };
    const spell: Pick<Spell, 'executeOnNote'> = {
      executeOnNote: true,
    };

    const snapshot = optionsFormSnapshotFromDefaults(defaults, spell);

    expect(snapshot.model).toBe('claude-opus');
    expect(snapshot.effort).toBe('medium');
    expect(snapshot.contextNotePaths).toEqual([]);
    expect(snapshot.followUp).toBe('');
    expect(snapshot.executeOnNote).toBe(true);
  });

  it('creates a snapshot with null effort from defaults', () => {
    const defaults: FormDefaults = {
      defaultModel: 'claude-haiku',
      defaultEffort: null,
    };
    const spell: Pick<Spell, 'executeOnNote'> = {
      executeOnNote: false,
    };

    const snapshot = optionsFormSnapshotFromDefaults(defaults, spell);

    expect(snapshot.model).toBe('claude-haiku');
    expect(snapshot.effort).toBeNull();
    expect(snapshot.contextNotePaths).toEqual([]);
    expect(snapshot.followUp).toBe('');
    expect(snapshot.executeOnNote).toBe(false);
  });

  it('returns a fresh empty array for contextNotePaths on each call', () => {
    const defaults: FormDefaults = {
      defaultModel: 'claude-opus',
      defaultEffort: 'medium',
    };
    const spell: Pick<Spell, 'executeOnNote'> = {
      executeOnNote: false,
    };

    const snapshot1 = optionsFormSnapshotFromDefaults(defaults, spell);
    const snapshot2 = optionsFormSnapshotFromDefaults(defaults, spell);

    // Verify both are empty
    expect(snapshot1.contextNotePaths).toEqual([]);
    expect(snapshot2.contextNotePaths).toEqual([]);

    // Verify they are not the same reference
    expect(snapshot1.contextNotePaths).not.toBe(snapshot2.contextNotePaths);

    // Verify mutation of the first doesn't affect the second
    (snapshot1.contextNotePaths as string[]).push('some-path');
    expect(snapshot2.contextNotePaths).toEqual([]);
  });
});
