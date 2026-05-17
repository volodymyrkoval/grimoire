/**
 * Integration test: CastDispatcher remote path.
 *
 * Seam: the boundary between CastDispatcher (parent) and its collaborators
 * Caster + CastLogWriter (real children via createCaster + CastLogStore).
 * Only leaf adapters are stubbed: requestUrl (HTTP I/O), appendLine (filesystem),
 * notify/close (UI), CastRunner.prototype.run (local process).
 *
 * Covers:
 *   1. Remote 202 happy path — requestUrl shape, both casted events land in the
 *      LOCAL log (the remote log is portal-owned for in-progress/done events).
 *   2. Local branch — CastRunner.run called, requestUrl never touched.
 *   3. Pre-dispatch guard — empty portalHost blocks dispatch before any I/O.
 */

import { modelId } from '../../src/domain/settings/ModelId';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastDispatcher } from '../../src/cast/CastDispatcher';
import { CastRunner } from '../../src/cast/local/CastRunner';
import { CastLogStore } from '../../src/castLog/store';
import { createCaster } from '../../src/cast/createCaster';
import { requestUrl } from 'obsidian';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';
import type { Spell } from '../../src/domain/spells/Spell';

// ─── constants ────────────────────────────────────────────────────────────────

const REMOTE_LOG = '/vault/cast-log-agent.jsonl';
const LOCAL_LOG = '/vault/cast-log-plugin.jsonl';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<GrimoireSettings> = {}): GrimoireSettings {
  return {
    vaultMountPath: '/vault',
    spellTag: 'grimoire/spell',
    binaryPath: '/usr/bin/claude',
    cliCommand: 'claude',
    forgeOutputFolder: 'Spells/',
    defaultModel: modelId('claude-sonnet-4-5'),
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

describe('remote-cast integration — CastDispatcher → createCaster → CastLogStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('remote 202: calls requestUrl with correct shape, writes both casted events to the LOCAL log', async () => {
    const writesByPath = new Map<string, string[]>();
    const captureAppend = vi.fn(async (path: string, line: string) => {
      const bucket = writesByPath.get(path) ?? [];
      bucket.push(line);
      writesByPath.set(path, bucket);
    });

    vi.mocked(requestUrl).mockResolvedValue({
      status: 202,
      json: { castId: 'srv-1', spellPath: 'x', status: 'accepted' },
      text: '',
    });

    // Production wiring (post-fix): the dispatcher's logWriter is always backed by the
    // local cast log, even in remote mode. Reproduce that here.
    const localLogStore = new CastLogStore({
      getLogPathAbs: () => LOCAL_LOG,
      appendLine: captureAppend,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const remoteSettings = makeSettings({ executionMode: 'remote', portalHost: 'portal.example.com' });

    const notify = vi.fn();
    const close = vi.fn();

    const dispatcher = new CastDispatcher({
      notify,
      close,
      caster: () => createCaster(remoteSettings),
      logWriter: () => localLogStore,
      generateId: () => 'cast-abc',
    });

    dispatcher.dispatch({
      spell: testSpell,
      model: modelId('claude-sonnet-4-5'),
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: remoteSettings,
      activeFilePath: null,
      executeOnNote: false,
    });

    // Wait for the async transport to call requestUrl
    await vi.waitFor(() => expect(vi.mocked(requestUrl)).toHaveBeenCalledOnce());
    // Wait for the onAccepted callback to write the second log entry
    await vi.waitFor(() => expect(captureAppend).toHaveBeenCalledTimes(2));

    // requestUrl shape
    const [reqArg] = vi.mocked(requestUrl).mock.calls[0];
    expect(reqArg.url).toBe('https://portal.example.com');
    expect(reqArg.method).toBe('POST');
    expect(reqArg.headers?.Authorization).toMatch(/^Basic /);
    expect(reqArg.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(reqArg.body as string);
    expect(body).toMatchObject({
      castId: 'cast-abc',
      spellPath: 'Spells/Test.md',
      model: modelId('claude-sonnet-4-5'),
    });
    expect(reqArg.throw).toBe(false);

    // notice and modal close
    expect(notify).toHaveBeenCalledWith("Casting 'Test' on portal…");
    expect(close).toHaveBeenCalledOnce();

    // Invariant: both casted events land in the LOCAL log; the remote log gets nothing.
    const localLines = (writesByPath.get(LOCAL_LOG) ?? []).map((l) => JSON.parse(l.trim()));
    expect(localLines).toHaveLength(2);
    const [first, second] = localLines;
    expect(first.stage).toBe('casted');
    expect(first.castId).toBe('cast-abc');
    expect(first.portalCastId).toBeUndefined();
    expect(second.stage).toBe('casted');
    expect(second.castId).toBe('cast-abc');
    expect(second.portalCastId).toBe('srv-1');

    expect(writesByPath.has(REMOTE_LOG)).toBe(false);
  });

  it('local branch: CastRunner.run called, requestUrl never called, only local log written', async () => {
    const captureAppend = vi.fn().mockResolvedValue(undefined);
    const runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});
    const localSettings = makeSettings({ executionMode: 'local' });

    const localLogStore = new CastLogStore({
      getLogPathAbs: () => LOCAL_LOG,
      appendLine: captureAppend,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: () => createCaster(localSettings),
      logWriter: () => localLogStore,
      generateId: () => 'cast-local',
    });

    dispatcher.dispatch({
      spell: testSpell,
      model: modelId('claude-sonnet-4-5'),
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: localSettings,
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(runSpy).toHaveBeenCalledOnce();
    expect(vi.mocked(requestUrl)).not.toHaveBeenCalled();

    // Local log has one casted line
    expect(captureAppend).toHaveBeenCalledOnce();
    const [logPath, logLine] = captureAppend.mock.calls[0];
    expect(logPath).toBe(LOCAL_LOG);
    const event = JSON.parse(logLine.trim());
    expect(event.stage).toBe('casted');
    expect(event.castId).toBe('cast-local');

    runSpy.mockRestore();
  });

  it('remote with empty host: guard fires, no log write, popup stays open', async () => {
    const captureAppend = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();
    const close = vi.fn();

    const remoteLogStore = new CastLogStore({
      getLogPathAbs: () => REMOTE_LOG,
      appendLine: captureAppend,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const guardSettings = makeSettings({ executionMode: 'remote', portalHost: '' });

    const dispatcher = new CastDispatcher({
      notify,
      close,
      caster: () => createCaster(guardSettings),
      logWriter: () => remoteLogStore,
      generateId: () => 'cast-guard',
    });

    dispatcher.dispatch({
      spell: testSpell,
      model: modelId('claude-sonnet-4-5'),
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: guardSettings,
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(notify).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(close).not.toHaveBeenCalled();
    expect(captureAppend).not.toHaveBeenCalled();
    expect(vi.mocked(requestUrl)).not.toHaveBeenCalled();
  });
});
