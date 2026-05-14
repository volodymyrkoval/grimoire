import { describe, it, expect } from 'vitest';
import type { CastLogEvent, CastedEvent, InProgressEvent, DoneEvent, ErrorEvent } from '../../src/castLog/types';
import { foldEvents } from '../../src/castLog/foldEvents';
import type { CastRecord } from '../../src/castLog/CastRecord';

describe('foldEvents', () => {
  it('empty input returns empty array', () => {
    const result = foldEvents([]);
    expect(result).toEqual([]);
  });

  it('single casted event creates record with status=casted', () => {
    const castedEvent: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: ['Note 1'],
    };

    const result = foldEvents([castedEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      status: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: ['Note 1'],
      castedTs: '2025-05-14T10:00:00Z',
    });
  });

  it('casted → in-progress sets startedTs and status', () => {
    const castedEvent: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const inProgressEvent: InProgressEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:05Z',
      stage: 'in-progress',
    };

    const result = foldEvents([castedEvent, inProgressEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      status: 'in-progress',
      startedTs: '2025-05-14T10:00:05Z',
    });
  });

  it('casted → in-progress → done sets endedTs, affectedFiles, and status', () => {
    const castedEvent: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const inProgressEvent: InProgressEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:05Z',
      stage: 'in-progress',
    };

    const doneEvent: DoneEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:10Z',
      stage: 'done',
      affectedFiles: ['output.md'],
    };

    const result = foldEvents([castedEvent, inProgressEvent, doneEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      status: 'done',
      endedTs: '2025-05-14T10:00:10Z',
      affectedFiles: ['output.md'],
    });
  });

  it('casted → error sets errorMessage, endedTs, and status', () => {
    const castedEvent: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const errorEvent: ErrorEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:05Z',
      stage: 'error',
      message: 'Something went wrong',
    };

    const result = foldEvents([castedEvent, errorEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      status: 'error',
      endedTs: '2025-05-14T10:00:05Z',
      errorMessage: 'Something went wrong',
    });
  });

  it('in-progress after done does not regress status', () => {
    const castedEvent: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const doneEvent: DoneEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:05Z',
      stage: 'done',
    };

    const inProgressEvent: InProgressEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:10Z',
      stage: 'in-progress',
    };

    const result = foldEvents([castedEvent, doneEvent, inProgressEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      status: 'done',
    });
  });

  it('drops records without a casted event', () => {
    const inProgressEvent: InProgressEvent = {
      castId: 'orphan-cast',
      ts: '2025-05-14T10:00:00Z',
      stage: 'in-progress',
    };

    const doneEvent: DoneEvent = {
      castId: 'orphan-cast',
      ts: '2025-05-14T10:00:05Z',
      stage: 'done',
    };

    const result = foldEvents([inProgressEvent, doneEvent]);

    expect(result).toHaveLength(0);
  });

  it('two casts fold independently', () => {
    const cast1Casted: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/Spell1.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const cast2Casted: CastedEvent = {
      castId: 'cast-2',
      ts: '2025-05-14T10:01:00Z',
      stage: 'casted',
      spellPath: 'Spells/Spell2.md',
      model: 'claude',
      effort: 'M',
      contextNotes: [],
    };

    const cast1Done: DoneEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:05Z',
      stage: 'done',
    };

    const cast2InProgress: InProgressEvent = {
      castId: 'cast-2',
      ts: '2025-05-14T10:01:05Z',
      stage: 'in-progress',
    };

    const result = foldEvents([cast1Casted, cast2Casted, cast1Done, cast2InProgress]);

    expect(result).toHaveLength(2);

    const cast1 = result.find(r => r.castId === 'cast-1');
    expect(cast1).toMatchObject({
      castId: 'cast-1',
      status: 'done',
      spellPath: 'Spells/Spell1.md',
      model: 'gpt-4o',
    });

    const cast2 = result.find(r => r.castId === 'cast-2');
    expect(cast2).toMatchObject({
      castId: 'cast-2',
      status: 'in-progress',
      spellPath: 'Spells/Spell2.md',
      model: 'claude',
      effort: 'M',
    });
  });

  it('sorts reverse-chronological by castedTs (newest first)', () => {
    const cast1: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/Spell1.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const cast2: CastedEvent = {
      castId: 'cast-2',
      ts: '2025-05-14T10:10:00Z',
      stage: 'casted',
      spellPath: 'Spells/Spell2.md',
      model: 'claude',
      effort: null,
      contextNotes: [],
    };

    const result = foldEvents([cast1, cast2]);

    expect(result).toHaveLength(2);
    expect(result[0].castId).toBe('cast-2');
    expect(result[1].castId).toBe('cast-1');
  });

  it('later fields fill empty slots', () => {
    const castedEvent: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const doneEvent: DoneEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:05Z',
      stage: 'done',
      affectedFiles: ['output.md'],
    };

    const result = foldEvents([castedEvent, doneEvent]);

    // affectedFiles should be present on the record (filled from doneEvent)
    expect(result[0]).toMatchObject({
      affectedFiles: ['output.md'],
    });
  });

  it('single casted event with portalCastId propagates to record', () => {
    const castedEvent: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
      portalCastId: 'srv-abc',
    };

    const result = foldEvents([castedEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      portalCastId: 'srv-abc',
    });
  });

  it('seed casted event is not processed twice when reduce runs over remaining events only', () => {
    // Regression: processCastGroup used to reduce over all events including the seed.
    // The seed is found by find(); remaining events are reduced separately.
    // When the seed has a portalCastId and the second (bare) event arrives first in the array,
    // double-processing the seed in reduce would call updateRecordWithEvent on it again —
    // re-applying portalCastId (idempotent) then the bare event (no-op). Still correct.
    // The fix ensures the seed is excluded from the reduce so future logic changes cannot
    // accidentally double-apply seed-level fields.
    const castedBare: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const castedWithId: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:01Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
      portalCastId: 'srv-xyz',
    };

    // seed = castedBare (first found by find); remaining = [castedWithId]
    // reduce over remaining sets portalCastId from castedWithId
    const result = foldEvents([castedBare, castedWithId]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      portalCastId: 'srv-xyz',
    });
  });

  it('later casted event with portalCastId overwrites earlier one', () => {
    const castedEvent1: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:00Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
    };

    const castedEvent2: CastedEvent = {
      castId: 'cast-1',
      ts: '2025-05-14T10:00:01Z',
      stage: 'casted',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
      effort: null,
      contextNotes: [],
      portalCastId: 'srv-patch',
    };

    const result = foldEvents([castedEvent1, castedEvent2]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      castId: 'cast-1',
      portalCastId: 'srv-patch',
      spellPath: 'Spells/MySpell.md',
      model: 'gpt-4o',
    });
  });
});
