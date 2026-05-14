import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastLogStore } from '../../src/castLog/store';
import type { CastLogEvent } from '../../src/castLog/types';

describe('CastLogStore.readAll', () => {
  describe('reading local file', () => {
    it('should read local file and return parsed events', async () => {
      const readFile = vi.fn().mockResolvedValue(
        JSON.stringify({
          castId: 'c1',
          stage: 'casted',
          ts: '2026-01-01T00:00:00.000Z',
          spellPath: 's.md',
          model: 'sonnet',
          effort: 'medium',
          contextNotes: [],
        }) + '\n'
      );

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(readFile).toHaveBeenCalledTimes(1);
      expect(readFile).toHaveBeenCalledWith(
        '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        'utf-8'
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        castId: 'c1',
        stage: 'casted',
        ts: '2026-01-01T00:00:00.000Z',
        spellPath: 's.md',
        model: 'sonnet',
        effort: 'medium',
        contextNotes: [],
      });
    });
  });

  describe('handling missing local file', () => {
    it('should treat ENOENT as empty and return []', async () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      const readFile = vi.fn().mockRejectedValue(error);

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(events).toEqual([]);
    });
  });

  describe('handling I/O errors', () => {
    it('should console.error on non-ENOENT error and return []', async () => {
      const error = new Error('Permission denied');
      const readFile = vi.fn().mockRejectedValue(error);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
      expect(events).toEqual([]);

      consoleError.mockRestore();
    });
  });

  describe('handling malformed JSON', () => {
    it('should silently drop lines that fail JSON.parse', async () => {
      const readFile = vi.fn().mockResolvedValue(
        'not json\n' +
        JSON.stringify({
          castId: 'c1',
          stage: 'casted',
          ts: '2026-01-01T00:00:00.000Z',
          spellPath: 's.md',
          model: 'sonnet',
          effort: 'medium',
          contextNotes: [],
        }) +
        '\n'
      );

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(events).toHaveLength(1);
      expect(events[0].castId).toBe('c1');
    });
  });

  describe('handling missing required fields', () => {
    it('should drop lines missing castId', async () => {
      const readFile = vi.fn().mockResolvedValue(
        JSON.stringify({
          stage: 'casted',
          ts: '2026-01-01T00:00:00.000Z',
        }) +
        '\n' +
        JSON.stringify({
          castId: 'c1',
          stage: 'casted',
          ts: '2026-01-01T00:00:00.000Z',
          spellPath: 's.md',
          model: 'sonnet',
          effort: 'medium',
          contextNotes: [],
        }) +
        '\n'
      );

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(events).toHaveLength(1);
      expect(events[0].castId).toBe('c1');
    });

    it('should drop lines missing stage', async () => {
      const readFile = vi.fn().mockResolvedValue(
        JSON.stringify({
          castId: 'c1',
          ts: '2026-01-01T00:00:00.000Z',
        }) +
        '\n' +
        JSON.stringify({
          castId: 'c2',
          stage: 'casted',
          ts: '2026-01-01T00:00:00.000Z',
          spellPath: 's.md',
          model: 'sonnet',
          effort: 'medium',
          contextNotes: [],
        }) +
        '\n'
      );

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(events).toHaveLength(1);
      expect(events[0].castId).toBe('c2');
    });
  });

  describe('reading remote file', () => {
    it('should read remote file when getRemoteLogPathAbs is provided', async () => {
      const readFile = vi.fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            castId: 'local',
            stage: 'casted',
            ts: '2026-01-01T00:00:00.000Z',
            spellPath: 's.md',
            model: 'sonnet',
            effort: 'medium',
            contextNotes: [],
          }) + '\n'
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            castId: 'remote',
            stage: 'casted',
            ts: '2026-01-01T01:00:00.000Z',
            spellPath: 's2.md',
            model: 'opus',
            effort: 'large',
            contextNotes: [],
          }) + '\n'
        );

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        getRemoteLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-remote.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(readFile).toHaveBeenCalledTimes(2);
      expect(events).toHaveLength(2);
      expect(events).toContainEqual(expect.objectContaining({ castId: 'local' }));
      expect(events).toContainEqual(expect.objectContaining({ castId: 'remote' }));
    });

    it('should skip remote file when getRemoteLogPathAbs is not provided', async () => {
      const readFile = vi.fn().mockResolvedValue(
        JSON.stringify({
          castId: 'local',
          stage: 'casted',
          ts: '2026-01-01T00:00:00.000Z',
          spellPath: 's.md',
          model: 'sonnet',
          effort: 'medium',
          contextNotes: [],
        }) + '\n'
      );

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(readFile).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0].castId).toBe('local');
    });

    it('should treat missing remote file as empty', async () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      const readFile = vi.fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            castId: 'local',
            stage: 'casted',
            ts: '2026-01-01T00:00:00.000Z',
            spellPath: 's.md',
            model: 'sonnet',
            effort: 'medium',
            contextNotes: [],
          }) + '\n'
        )
        .mockRejectedValueOnce(error);

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        getRemoteLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-remote.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(events).toHaveLength(1);
      expect(events[0].castId).toBe('local');
    });
  });

  describe('empty lines', () => {
    it('should skip empty lines', async () => {
      const readFile = vi.fn().mockResolvedValue(
        JSON.stringify({
          castId: 'c1',
          stage: 'casted',
          ts: '2026-01-01T00:00:00.000Z',
          spellPath: 's.md',
          model: 'sonnet',
          effort: 'medium',
          contextNotes: [],
        }) +
        '\n\n' +
        JSON.stringify({
          castId: 'c2',
          stage: 'casted',
          ts: '2026-01-01T01:00:00.000Z',
          spellPath: 's2.md',
          model: 'sonnet',
          effort: 'medium',
          contextNotes: [],
        }) +
        '\n'
      );

      const store = new CastLogStore({
        getLogPathAbs: () => '/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl',
        readFile,
      });

      const events = await store.readAll();

      expect(events).toHaveLength(2);
      expect(events[0].castId).toBe('c1');
      expect(events[1].castId).toBe('c2');
    });
  });
});
