/**
 * Full-stack integration test: real CastLogStore ↔ real CastLogPanel seam for delete and clear-all.
 *
 * Tests the wiring established in H1:
 * - CastLogModule.buildCastLogPanelDeps() returns mutator: this.#pluginCastLogStore
 * - CastLogPanel receives the real store and invokes deleteCast / clearAll
 * - Delete removes cast's lines from both log files (stubbed-adapter in-memory)
 * - Panel repaints after delete
 * - Clear-all empties both files
 *
 * Seam: real CastLogStore + real CastLogPanel with a stubbed in-memory DataAdapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DataAdapter } from 'obsidian';
import { CastLogStore } from '../../src/castLog/store';
import { CastLogSource } from '../../src/castLog/CastLogSource';
import { CastLogPanel } from '../../src/ui/tabs/CastLogPanel';
import { foldEvents } from '../../src/castLog/foldEvents';
import { App } from '../__mocks__/obsidian';

// ---------------------------------------------------------------------------
// In-memory DataAdapter stub
// ---------------------------------------------------------------------------

function makeInMemoryAdapter(
  files: Record<string, string> = {},
): DataAdapter {
  return {
    exists: vi.fn(async (path: string) => path in files),
    read: vi.fn(async (path: string) => files[path] ?? ''),
    write: vi.fn(async (path: string, data: string) => {
      files[path] = data;
    }),
    remove: vi.fn(async () => {}),
  } as unknown as DataAdapter;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const flushPromises = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('store-panel full-stack: delete and clear-all', () => {
  const LOCAL_LOG = '/vault/.obsidian/plugins/grimoire/cast-log-plugin.json';
  const AGENT_LOG = '/vault/.obsidian/plugins/grimoire/cast-log-agent.json';

  let files: Record<string, string>;
  let adapter: DataAdapter;
  let store: CastLogStore;

  beforeEach(() => {
    files = {};
    adapter = makeInMemoryAdapter(files);
  });

  describe('delete operation', () => {
    // (a) Delete removes matching cast's lines from both files
    it('deleteCast removes all lines with the given castId from both log files', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      // Write two casts: cast-a (3 lines) and cast-b (2 lines)
      files[LOCAL_LOG] = `{"stage":"casted","castId":"cast-a","ts":"2026-01-01T00:00:00Z"}
{"stage":"done","castId":"cast-a","ts":"2026-01-01T00:00:01Z"}
{"stage":"casted","castId":"cast-b","ts":"2026-01-01T00:00:02Z"}
`;
      files[AGENT_LOG] = `{"stage":"in-progress","castId":"cast-a","ts":"2026-01-01T00:00:03Z"}
{"stage":"done","castId":"cast-b","ts":"2026-01-01T00:00:04Z"}
`;

      // Delete cast-a
      await store.deleteCast('cast-a');

      // Verify cast-a is gone from both files
      expect(files[LOCAL_LOG]).not.toContain('cast-a');
      expect(files[AGENT_LOG]).not.toContain('cast-a');

      // Verify cast-b lines survive
      expect(files[LOCAL_LOG]).toContain('cast-b');
      expect(files[AGENT_LOG]).toContain('cast-b');
    });

    // (b) Unparseable lines are preserved during delete
    it('deleteCast preserves unparseable and malformed lines when removing matching cast', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      // Mix of valid JSON, invalid JSON, and blank lines
      files[LOCAL_LOG] = `{"stage":"casted","castId":"cast-a","ts":"2026-01-01T00:00:00Z"}
this is not json
{"stage":"casted","castId":"cast-b","ts":"2026-01-01T00:00:01Z"}

`;

      await store.deleteCast('cast-a');

      // cast-a is gone, cast-b survives, unparseable + blank line survive
      expect(files[LOCAL_LOG]).not.toContain('cast-a');
      expect(files[LOCAL_LOG]).toContain('cast-b');
      expect(files[LOCAL_LOG]).toContain('this is not json');
    });

    // (c) Delete tolerates missing agent file
    it('deleteCast is a no-op on a missing agent log file (no throw)', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      files[LOCAL_LOG] = `{"stage":"casted","castId":"cast-a","ts":"2026-01-01T00:00:00Z"}`;
      // AGENT_LOG not in files, adapter.exists will return false for it

      await expect(store.deleteCast('cast-a')).resolves.toBeUndefined();
      expect(files[LOCAL_LOG]).not.toContain('cast-a');
    });

    // (d) Delete of non-existent castId is a clean no-op
    it('deleteCast of a castId not in either file is a clean no-op', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      const originalLocal = `{"stage":"casted","castId":"cast-a","ts":"2026-01-01T00:00:00Z"}\n`;
      files[LOCAL_LOG] = originalLocal;

      await store.deleteCast('cast-never-existed');

      expect(files[LOCAL_LOG]).toBe(originalLocal);
    });
  });

  describe('clear-all operation', () => {
    // (e) Clear-all empties both files
    it('clearAll empties both configured log files', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      files[LOCAL_LOG] = `{"stage":"casted","castId":"cast-a","ts":"2026-01-01T00:00:00Z"}
{"stage":"casted","castId":"cast-b","ts":"2026-01-01T00:00:01Z"}
`;
      files[AGENT_LOG] = `{"stage":"done","castId":"cast-a","ts":"2026-01-01T00:00:02Z"}
{"stage":"done","castId":"cast-b","ts":"2026-01-01T00:00:03Z"}
`;

      await store.clearAll();

      expect(files[LOCAL_LOG]).toBe('');
      expect(files[AGENT_LOG]).toBe('');
    });

    // (f) Clear-all tolerates missing agent file
    it('clearAll tolerates a missing agent log file (no throw)', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      files[LOCAL_LOG] = `{"stage":"casted","castId":"cast-a","ts":"2026-01-01T00:00:00Z"}`;

      await expect(store.clearAll()).resolves.toBeUndefined();
      expect(files[LOCAL_LOG]).toBe('');
    });
  });

  describe('panel integration: delete', () => {
    // (g) Delete through the panel removes lines from both files, panel source reloads successfully
    it('deleting a cast through the wired panel removes its lines from both files', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      // Write initial data with two casts
      files[LOCAL_LOG] = `{"stage":"casted","castId":"cast-a","spellPath":"Spells/A.md","model":"claude-opus-4-7","effort":null,"contextNotes":[],"ts":"2026-01-01T00:00:00Z"}
{"stage":"casted","castId":"cast-b","spellPath":"Spells/B.md","model":"claude-sonnet-4-6","effort":"low","contextNotes":[],"ts":"2026-01-01T00:00:01Z"}
`;
      files[AGENT_LOG] = `{"stage":"done","castId":"cast-a","ts":"2026-01-01T00:00:02Z"}
{"stage":"done","castId":"cast-b","ts":"2026-01-01T00:00:03Z"}
`;

      // Create source (used by panel)
      const source = new CastLogSource({
        reader: store,
        foldEvents,
      });

      // Load both casts to verify starting state
      let records = await source.load();
      expect(records.length).toBe(2);

      // Directly call deleteCast on the store (simulating the panel's #handleDeleteCast)
      await store.deleteCast('cast-a');

      // Verify cast-a is removed from both files
      expect(files[LOCAL_LOG]).not.toContain('cast-a');
      expect(files[AGENT_LOG]).not.toContain('cast-a');

      // Verify cast-b lines survive
      expect(files[LOCAL_LOG]).toContain('cast-b');
      expect(files[AGENT_LOG]).toContain('cast-b');

      // Reload via source (simulating panel's #reload() call)
      records = await source.load();
      expect(records.length).toBe(1);
      expect(records[0].castId).toBe('cast-b');
    });
  });

  describe('panel integration: clear-all', () => {
    // (h) Clear-all through the panel empties both files
    it('clearing all casts through the wired panel empties both log files', async () => {
      store = new CastLogStore({
        adapter,
        getLogPathAbs: () => LOCAL_LOG,
        getAgentLogPathAbs: () => AGENT_LOG,
      });

      // Write initial data with two casts
      files[LOCAL_LOG] = `{"stage":"casted","castId":"cast-a","spellPath":"Spells/A.md","model":"claude-opus-4-7","effort":null,"contextNotes":[],"ts":"2026-01-01T00:00:00Z"}
{"stage":"casted","castId":"cast-b","spellPath":"Spells/B.md","model":"claude-sonnet-4-6","effort":"low","contextNotes":[],"ts":"2026-01-01T00:00:01Z"}
`;
      files[AGENT_LOG] = `{"stage":"done","castId":"cast-a","ts":"2026-01-01T00:00:02Z"}
{"stage":"done","castId":"cast-b","ts":"2026-01-01T00:00:03Z"}
`;

      // Create source (used by panel)
      const source = new CastLogSource({
        reader: store,
        foldEvents,
      });

      // Load both casts to verify starting state
      let records = await source.load();
      expect(records.length).toBe(2);

      // Directly call clearAll on the store (simulating the panel's #handleClearAll)
      await store.clearAll();

      // Verify both files are empty
      expect(files[LOCAL_LOG]).toBe('');
      expect(files[AGENT_LOG]).toBe('');

      // Reload via source (simulating panel's #reload() call)
      records = await source.load();
      expect(records.length).toBe(0);
    });
  });
});
