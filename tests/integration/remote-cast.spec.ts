/**
 * Integration test: CastDispatcher remote path.
 *
 * Seam: the boundary between CastDispatcher (parent) and its collaborators
 * RemoteCastTransport + CastLogStore (real children). Only leaf adapters are
 * stubbed: requestUrlFn (HTTP I/O), appendLine (filesystem), notify/close (UI),
 * castRunner.run (local process).
 *
 * Covers:
 *   1. Remote 202 happy path — requestUrl shape, two casted events in remote log.
 *   2. Local branch — castRunner.run called, remote transport never touched.
 *   3. Pre-dispatch guard — empty portalHost blocks dispatch before any I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastDispatcher } from '../../src/cast/CastDispatcher';
import { RemoteCastTransport } from '../../src/cast/RemoteCastTransport';
import { CastLogStore } from '../../src/castLog/store';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';
import type { Spell } from '../../src/domain/spells/Spell';

// ─── constants ────────────────────────────────────────────────────────────────

const LOCAL_LOG = '/vault/cast-log-local.jsonl';
const REMOTE_LOG = '/vault/cast-log-remote.jsonl';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<GrimoireSettings> = {}): GrimoireSettings {
  return {
    vaultMountPath: '/vault',
    spellTag: 'grimoire/spell',
    binaryPath: '/usr/bin/claude',
    cliCommand: 'claude',
    forgeOutputFolder: 'Spells/',
    defaultModel: 'claude-sonnet-4-5',
    defaultEffort: null,
    executionMode: 'local',
    portalHost: '',
    portalPort: '',
    portalPath: '',
    portalAuthUser: 'alice',
    portalAuthPassword: 'secret',
    ...overrides,
  };
}

const testSpell: Spell = {
  name: 'Test',
  path: 'Spells/Test.md',
  executeOnNote: false,
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe('remote-cast integration — CastDispatcher → RemoteCastTransport → CastLogStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('remote 202: calls requestUrl with correct shape, writes two casted events to remote log', async () => {
    const logLines: Record<string, string[]> = { [REMOTE_LOG]: [], [LOCAL_LOG]: [] };
    const captureAppend = vi.fn(async (path: string, line: string) => {
      logLines[path] = logLines[path] ?? [];
      logLines[path].push(line);
    });

    const requestUrlFn = vi.fn().mockResolvedValue({
      status: 202,
      json: { castId: 'srv-1', spellPath: 'x', status: 'accepted' },
      text: '',
    });

    const store = new CastLogStore({
      getLogPathAbs: () => LOCAL_LOG,
      getRemoteLogPathAbs: () => REMOTE_LOG,
      appendLine: captureAppend,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const transport = new RemoteCastTransport({ requestUrlFn });

    const notify = vi.fn();
    const close = vi.fn();

    const dispatcher = new CastDispatcher({
      notify,
      close,
      castRunner: { run: vi.fn() } as any,
      remoteTransport: transport,
      castLogStore: store,
      generateId: () => 'cast-abc',
    });

    dispatcher.dispatch({
      spell: testSpell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: makeSettings({ executionMode: 'remote', portalHost: 'portal.example.com' }),
      activeFilePath: null,
      executeOnNote: false,
    });

    // Wait for the async transport to call requestUrl
    await vi.waitFor(() => expect(requestUrlFn).toHaveBeenCalledOnce());
    // Wait for the onAccepted callback to write the second log entry
    await vi.waitFor(() => expect(captureAppend).toHaveBeenCalledTimes(2));

    // requestUrl shape
    const [reqArg] = requestUrlFn.mock.calls[0];
    expect(reqArg.url).toBe('https://portal.example.com');
    expect(reqArg.method).toBe('POST');
    expect(reqArg.headers?.Authorization).toMatch(/^Basic /);
    expect(reqArg.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(reqArg.body);
    expect(body).toMatchObject({
      castId: 'cast-abc',
      spellPath: 'Spells/Test.md',
      model: 'claude-sonnet-4-5',
    });
    expect(reqArg.throw).toBe(false);

    // notice and modal close
    expect(notify).toHaveBeenCalledWith("Casting 'Test' on portal…");
    expect(close).toHaveBeenCalledOnce();

    // Remote log has two casted entries; local log is untouched
    const remoteLines = logLines[REMOTE_LOG].map((l) => JSON.parse(l.trim()));
    expect(remoteLines).toHaveLength(2);
    const [first, second] = remoteLines;
    expect(first.stage).toBe('casted');
    expect(first.castId).toBe('cast-abc');
    expect(first.portalCastId).toBeUndefined();
    expect(second.stage).toBe('casted');
    expect(second.castId).toBe('cast-abc');
    expect(second.portalCastId).toBe('srv-1');

    expect(logLines[LOCAL_LOG]).toHaveLength(0);
  });

  it('local branch: castRunner.run called, requestUrl never called, only local log written', async () => {
    const captureAppend = vi.fn().mockResolvedValue(undefined);
    const requestUrlFn = vi.fn();

    const store = new CastLogStore({
      getLogPathAbs: () => LOCAL_LOG,
      getRemoteLogPathAbs: () => REMOTE_LOG,
      appendLine: captureAppend,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const transport = new RemoteCastTransport({ requestUrlFn });
    const castRunner = { run: vi.fn() } as any;

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner,
      remoteTransport: transport,
      castLogStore: store,
      generateId: () => 'cast-local',
    });

    dispatcher.dispatch({
      spell: testSpell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: makeSettings({ executionMode: 'local' }),
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(castRunner.run).toHaveBeenCalledOnce();
    expect(requestUrlFn).not.toHaveBeenCalled();

    // Local log has one casted line
    expect(captureAppend).toHaveBeenCalledOnce();
    const [logPath, logLine] = captureAppend.mock.calls[0];
    expect(logPath).toBe(LOCAL_LOG);
    const event = JSON.parse(logLine.trim());
    expect(event.stage).toBe('casted');
    expect(event.castId).toBe('cast-local');
  });

  it('remote with empty host: guard fires, no log write, popup stays open', async () => {
    const captureAppend = vi.fn().mockResolvedValue(undefined);
    const requestUrlFn = vi.fn();
    const notify = vi.fn();
    const close = vi.fn();

    const store = new CastLogStore({
      getLogPathAbs: () => LOCAL_LOG,
      getRemoteLogPathAbs: () => REMOTE_LOG,
      appendLine: captureAppend,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const transport = new RemoteCastTransport({ requestUrlFn });

    const dispatcher = new CastDispatcher({
      notify,
      close,
      castRunner: { run: vi.fn() } as any,
      remoteTransport: transport,
      castLogStore: store,
      generateId: () => 'cast-guard',
    });

    dispatcher.dispatch({
      spell: testSpell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: makeSettings({ executionMode: 'remote', portalHost: '' }),
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(notify).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(close).not.toHaveBeenCalled();
    expect(captureAppend).not.toHaveBeenCalled();
    expect(requestUrlFn).not.toHaveBeenCalled();
  });
});
