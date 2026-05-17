import { modelId } from '../../src/domain/settings/ModelId';
import { describe, it, expect, vi } from 'vitest';
import { CastLogSource } from '../../src/castLog/CastLogSource';
import type { CastLogReader } from '../../src/castLog/CastLogReader';
import type { CastLogEvent } from '../../src/castLog/types';
import type { CastRecord } from '../../src/castLog/CastRecord';

describe('CastLogSource.load', () => {
  it('should call reader.readAll and pass events to foldEvents', async () => {
    const events: CastLogEvent[] = [
      {
        castId: 'c1',
        stage: 'casted',
        ts: '2026-01-01T00:00:00.000Z',
        spellPath: 's.md',
        model: modelId('sonnet'),
        effort: 'medium',
        contextNotes: [],
      },
    ];

    const records: CastRecord[] = [
      {
        castId: 'c1',
        status: 'casted',
        spellPath: 's.md',
        model: modelId('sonnet'),
        effort: 'medium',
        contextNotes: [],
        castedTs: '2026-01-01T00:00:00.000Z',
      },
    ];

    const mockReader: CastLogReader = {
      readAll: vi.fn().mockResolvedValue(events),
    };

    const mockFoldEvents = vi.fn().mockReturnValue(records);

    const source = new CastLogSource({ reader: mockReader, foldEvents: mockFoldEvents });
    const result = await source.load();

    expect(mockReader.readAll).toHaveBeenCalledTimes(1);
    expect(mockFoldEvents).toHaveBeenCalledTimes(1);
    expect(mockFoldEvents).toHaveBeenCalledWith(events);
    expect(result).toEqual(records);
  });
});
