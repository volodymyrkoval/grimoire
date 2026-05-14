/**
 * Integration test: CastLogSource.load() → CastRecord[] composition seam.
 *
 * Seam: the boundary between CastLogSource (parent) and its CastLogReader
 * dependency. The reader stub sits exactly at the seam — foldEvents is injected
 * as the real function (grey-box, not white-box). No foldEvents internals are
 * re-tested here.
 *
 * RED until C1 (CastLogSource class) lands.
 */

import { describe, it, expect, vi } from 'vitest';
import { foldEvents } from '../../src/castLog/foldEvents';
import type { CastLogEvent } from '../../src/castLog/types';
import type { CastRecord } from '../../src/castLog/CastRecord';
// CastLogSource does not exist yet — this import causes the module-not-found red.
import { CastLogSource } from '../../src/castLog/CastLogSource';

interface CastLogReader {
  readAll(): Promise<CastLogEvent[]>;
}

/**
 * Two casts:
 *   Cast A — older (10:00Z), completed: casted → in-progress → done
 *   Cast B — newer (11:00Z), in-progress: casted → in-progress
 *
 * Events are intentionally not in chronological order to exercise sorting.
 */
const CAST_A_ID = 'cast-a';
const CAST_B_ID = 'cast-b';

const EVENTS: CastLogEvent[] = [
  // Cast B — casted (newer)
  {
    castId: CAST_B_ID,
    stage: 'casted',
    ts: '2024-01-01T11:00:00Z',
    spellPath: 'spells/fireball.md',
    model: 'claude-sonnet-4-5',
    effort: 'medium',
    contextNotes: [],
  },
  // Cast A — done (older, inserted in middle to exercise ordering)
  {
    castId: CAST_A_ID,
    stage: 'done',
    ts: '2024-01-01T10:05:00Z',
    affectedFiles: ['Notes/foo.md'],
  },
  // Cast A — casted (older)
  {
    castId: CAST_A_ID,
    stage: 'casted',
    ts: '2024-01-01T10:00:00Z',
    spellPath: 'spells/shield.md',
    model: 'claude-sonnet-4-5',
    effort: 'low',
    contextNotes: [],
  },
  // Cast B — in-progress
  {
    castId: CAST_B_ID,
    stage: 'in-progress',
    ts: '2024-01-01T11:01:00Z',
  },
  // Cast A — in-progress
  {
    castId: CAST_A_ID,
    stage: 'in-progress',
    ts: '2024-01-01T10:02:00Z',
  },
];

describe('CastLogSource.load() — composition seam', () => {
  it('resolves with two CastRecords in reverse-chronological order', async () => {
    const reader: CastLogReader = {
      readAll: vi.fn().mockResolvedValue(EVENTS),
    };

    const source = new CastLogSource({ reader, foldEvents });
    const records: CastRecord[] = await source.load();

    // Two casts total
    expect(records).toHaveLength(2);

    // Newest cast (B) is first
    expect(records[0].castId).toBe(CAST_B_ID);
    expect(records[0].status).toBe('in-progress');
    expect(records[0].castedTs).toBe('2024-01-01T11:00:00Z');
    expect(records[0].startedTs).toBe('2024-01-01T11:01:00Z');

    // Older cast (A) is second
    expect(records[1].castId).toBe(CAST_A_ID);
    expect(records[1].status).toBe('done');
    expect(records[1].castedTs).toBe('2024-01-01T10:00:00Z');
    expect(records[1].startedTs).toBe('2024-01-01T10:02:00Z');
    expect(records[1].endedTs).toBe('2024-01-01T10:05:00Z');
    expect(records[1].affectedFiles).toContain('Notes/foo.md');
  });
});
