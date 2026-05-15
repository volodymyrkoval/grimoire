/**
 * Integration test: ForgeImprinter.imprint() — remote vs local branch invariant.
 *
 * Seam: the boundary between ForgeImprinter and its deps
 * (caster thunk, logWriter, notify, close).
 *
 * This is a logic integration test — it instantiates the real ForgeImprinter
 * with real createCaster() and vi.fn() stubs at the outermost boundary and
 * asserts the observable side effects.
 * No UI is rendered. Runs in the happy-dom environment alongside the other
 * integration specs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgeImprinter } from '../../src/forge/ForgeImprinter';
import { createCaster } from '../../src/cast/createCaster';
import { CastRunner } from '../../src/cast/local/CastRunner';
import { requestUrl } from 'obsidian';
import type { CastLogWriter } from '../../src/castLog/CastLogWriter';
import type { ForgeFormSnapshot } from '../../src/forge/ForgeFormSnapshot';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const snapshot: ForgeFormSnapshot = {
  name: 'My Spell',
  description: 'Does things',
  model: 'claude-sonnet-4-5',
  effort: 'medium',
  executeOnNote: false,
};

const localSettings: GrimoireSettings = {
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
  portalAuthUser: '',
  portalAuthPassword: '',
};

const remoteSettings: GrimoireSettings = {
  ...localSettings,
  executionMode: 'remote',
  portalHost: 'portal.example.com',
  portalPort: '',
  portalPath: '',
  portalAuthUser: 'alice',
  portalAuthPassword: 'secret',
};

function makeLogWriterStub(): CastLogWriter {
  return {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Test cases ───────────────────────────────────────────────────────────────

describe('remote-forge invariant — ForgeImprinter.imprint()', () => {
  let notify: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let logWriter: CastLogWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    notify = vi.fn();
    close = vi.fn();
    logWriter = makeLogWriterStub();
  });

  // ─── Case 1: local forge — routes to CastRunner ──────────────────────────

  it('Case 1 — local forge: routes to CastRunner, never touches requestUrl', () => {
    const runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(localSettings),
      logWriter: () => logWriter,
      generateId: () => 'local-id',
    });

    imprinter.imprint(snapshot, localSettings, close);

    expect(runSpy).toHaveBeenCalledOnce();
    expect(vi.mocked(requestUrl)).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  // ─── Case 2: remote forge with empty host — guard fires ───────────────────

  it('Case 2 — remote forge with empty host: notifies exact guard text, calls nothing else', () => {
    const emptyHostSettings: GrimoireSettings = { ...remoteSettings, portalHost: '' };

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(emptyHostSettings),
      logWriter: () => logWriter,
    });

    imprinter.imprint(snapshot, emptyHostSettings, close);

    expect(notify).toHaveBeenCalledWith(
      'Configure portal host in settings before casting remotely.'
    );
    expect(vi.mocked(requestUrl)).not.toHaveBeenCalled();
    expect(logWriter.recordCasted).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  // ─── Case 3: remote forge happy path ─────────────────────────────────────

  it('Case 3 — remote forge happy path: recordCasted, notice on portal, close, transport called', async () => {
    // 202 without castId → onAccepted fires, no second recordCasted
    vi.mocked(requestUrl).mockResolvedValue({ status: 202, text: '', json: {} });

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(remoteSettings),
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    // recordCasted called immediately (before async transport resolves)
    expect(logWriter.recordCasted).toHaveBeenCalledOnce();
    const callArg = (logWriter.recordCasted as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toMatchObject({ castId: 'forge-id', spellPath: '<forge>' });

    // Notice uses the sanitised name with "on portal…" suffix
    expect(notify).toHaveBeenCalledWith("Forging 'My Spell' on portal…");

    // close is called once
    expect(close).toHaveBeenCalledOnce();

    // transport.run was triggered (requestUrl pending)
    expect(vi.mocked(requestUrl)).toHaveBeenCalledOnce();
  });

  // ─── Case 4: onAccepted with portalCastId — second recordCasted ──────────

  it('Case 4 — onAccepted with portalCastId: second recordCasted with portalCastId', async () => {
    vi.mocked(requestUrl).mockResolvedValue({
      status: 202,
      text: '',
      json: { castId: 'srv-forge-1' },
    });

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(remoteSettings),
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    await vi.waitFor(() => {
      expect(logWriter.recordCasted).toHaveBeenCalledTimes(2);
    });

    expect(logWriter.recordCasted).toHaveBeenLastCalledWith(
      expect.objectContaining({ castId: 'forge-id', portalCastId: 'srv-forge-1' })
    );
  });

  // ─── Case 5: forge sentinel must not leak into the HTTP body ─────────────

  it('Case 5 — remote forge: HTTP body sent to portal omits the <forge> sentinel as spellPath', () => {
    // Portal treats `spellPath` as a file lookup key on its side. The cast-log
    // sentinel '<forge>' is a UI marker, not a real file — leaking it on the
    // wire makes the portal return 404 "spell not found". The transport must
    // strip the sentinel; an inline forge cast is driven purely by userPrompt.
    vi.mocked(requestUrl).mockResolvedValue({ status: 202, text: '', json: {} });

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(remoteSettings),
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    expect(vi.mocked(requestUrl)).toHaveBeenCalledOnce();
    const reqArg = vi.mocked(requestUrl).mock.calls[0][0];
    const parsedBody = JSON.parse(reqArg.body as string);
    expect(parsedBody).not.toHaveProperty('spellPath');
  });

  // ─── Case 6: onFailure — recordError + notify ─────────────────────────────

  it('Case 6 — onFailure: recordError called, notify called with mapped message', async () => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 500, text: 'Server error', json: null });

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(remoteSettings),
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    await vi.waitFor(() => {
      expect(logWriter.recordError).toHaveBeenCalledOnce();
    });

    const errorArg = (logWriter.recordError as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(errorArg).toMatchObject({ castId: 'forge-id' });
    expect(errorArg.message).toBeTruthy();

    expect(notify).toHaveBeenCalledWith(errorArg.message);
  });
});
