import { describe, it, expect } from 'vitest';
import { durationMs } from '../../../src/castLog/format/durationMs';
import type { CastRecord } from '../../../src/castLog/CastRecord';

describe('durationMs', () => {
  const now = new Date('2025-05-14T12:00:00Z');

  it('returns the difference between castedTs and endedTs for completed casts', () => {
    const record: CastRecord = {
      castId: 'test-1',
      status: 'done',
      spellPath: 'Spells/Test.md',
      model: 'claude-opus',
      effort: null,
      contextNotes: [],
      castedTs: new Date('2025-05-14T12:00:00Z').toISOString(),
      endedTs: new Date('2025-05-14T12:00:05Z').toISOString(),
    };

    expect(durationMs(record, now)).toBe(5000);
  });

  it('returns the difference between castedTs and now for in-flight casts', () => {
    const record: CastRecord = {
      castId: 'test-2',
      status: 'in-progress',
      spellPath: 'Spells/Test.md',
      model: 'claude-opus',
      effort: null,
      contextNotes: [],
      castedTs: new Date('2025-05-14T12:00:00Z').toISOString(),
    };

    expect(durationMs(record, now)).toBe(0);
  });

  it('returns the correct duration for longer operations', () => {
    const record: CastRecord = {
      castId: 'test-3',
      status: 'done',
      spellPath: 'Spells/Test.md',
      model: 'claude-opus',
      effort: null,
      contextNotes: [],
      castedTs: new Date('2025-05-14T11:50:00Z').toISOString(),
      endedTs: new Date('2025-05-14T12:00:00Z').toISOString(),
    };

    expect(durationMs(record, now)).toBe(600_000); // 10 minutes
  });

  it('returns a different duration for in-flight when now changes', () => {
    const record: CastRecord = {
      castId: 'test-4',
      status: 'in-progress',
      spellPath: 'Spells/Test.md',
      model: 'claude-opus',
      effort: null,
      contextNotes: [],
      castedTs: new Date('2025-05-14T12:00:00Z').toISOString(),
    };

    const now1 = new Date('2025-05-14T12:00:10Z');
    const now2 = new Date('2025-05-14T12:00:20Z');

    expect(durationMs(record, now1)).toBe(10_000);
    expect(durationMs(record, now2)).toBe(20_000);
  });
});
