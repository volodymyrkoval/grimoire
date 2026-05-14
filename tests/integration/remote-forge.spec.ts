/**
 * Integration test: ForgeImprinter.imprint() — remote vs local branch invariant.
 *
 * Seam: the boundary between ForgeImprinter and its deps
 * (castRunner, remoteTransport, castLogStore, notify, close).
 *
 * This is a logic integration test — it instantiates the real ForgeImprinter
 * with vi.fn() stubs at the boundary and asserts the observable side effects.
 * No UI is rendered. Runs in the happy-dom environment alongside the other
 * integration specs.
 *
 * Cases 2–5 are RED until F2 implements the remote branch in ForgeImprinter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgeImprinter } from '../../src/forge/ForgeImprinter';
import { CastLogStore } from '../../src/castLog/store';
import type { ForgeFormSnapshot } from '../../src/forge/ForgeFormSnapshot';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';
import type { CastRunner } from '../../src/cast/CastRunner';
import type { RemoteCastCallbacks, RemoteCastInput } from '../../src/cast/RemoteCastTransport';

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

function makeStubCastLogStore() {
  return {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  } as unknown as CastLogStore;
}

function makeStubCastRunner() {
  return {
    run: vi.fn(),
  } as unknown as CastRunner;
}

function makeStubRemoteTransport() {
  return {
    run: vi.fn<[RemoteCastInput, RemoteCastCallbacks], void>(),
  };
}

// ─── Test cases ───────────────────────────────────────────────────────────────

describe('remote-forge invariant — ForgeImprinter.imprint()', () => {
  let notify: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let castRunner: ReturnType<typeof makeStubCastRunner>;
  let castLogStore: CastLogStore;

  beforeEach(() => {
    notify = vi.fn();
    close = vi.fn();
    castRunner = makeStubCastRunner();
    castLogStore = makeStubCastLogStore();
  });

  // ─── Case 1: local forge — existing behaviour (should be GREEN) ───────────

  it('Case 1 — local forge: routes to castRunner, never touches remoteTransport', () => {
    const remoteTransport = makeStubRemoteTransport();

    const imprinter = new ForgeImprinter({
      notify,
      castRunner,
      castLogStore,
      remoteTransport: remoteTransport as any,
      generateId: () => 'local-id',
    });

    imprinter.imprint(snapshot, localSettings, close);

    expect(castRunner.run).toHaveBeenCalledOnce();
    expect(remoteTransport.run).not.toHaveBeenCalled();
  });

  // ─── Case 2: remote forge with empty host — guard fires (RED) ─────────────

  it('Case 2 — remote forge with empty host: notifies exact guard text, calls nothing else', () => {
    const remoteTransport = makeStubRemoteTransport();
    const emptyHostSettings: GrimoireSettings = {
      ...remoteSettings,
      portalHost: '',
    };

    const imprinter = new ForgeImprinter({
      notify,
      castRunner,
      castLogStore,
      remoteTransport: remoteTransport as any,
    });

    imprinter.imprint(snapshot, emptyHostSettings, close);

    expect(notify).toHaveBeenCalledWith(
      'Configure portal host in settings before casting remotely.'
    );
    expect(castRunner.run).not.toHaveBeenCalled();
    expect(remoteTransport.run).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  // ─── Case 3: remote forge happy path (RED) ────────────────────────────────

  it('Case 3 — remote forge happy path: recordCasted, notice, close, remoteTransport.run called', () => {
    const remoteTransport = makeStubRemoteTransport();

    const imprinter = new ForgeImprinter({
      notify,
      castRunner,
      castLogStore,
      remoteTransport: remoteTransport as any,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    // recordCasted called once (bare, no portalCastId) with remote flag
    expect(castLogStore.recordCasted).toHaveBeenCalledOnce();
    const [recordedInput, recordedOpts] = (castLogStore.recordCasted as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(recordedInput).toMatchObject({
      castId: 'forge-id',
      spellPath: '<forge>',
    });
    expect(recordedOpts).toEqual({ remote: true });

    // Notice uses the sanitised name with "on portal…" suffix
    expect(notify).toHaveBeenCalledWith("Forging 'My Spell' on portal…");

    // close is called once
    expect(close).toHaveBeenCalledOnce();

    // remoteTransport.run is called once with the expected shape
    expect(remoteTransport.run).toHaveBeenCalledOnce();
    const [transportInput] = remoteTransport.run.mock.calls[0] as [RemoteCastInput, RemoteCastCallbacks];
    expect(transportInput).toMatchObject({
      spellPath: '<forge>',
      portalHost: 'portal.example.com',
      castId: 'forge-id',
    });

    // local castRunner should NOT be called
    expect(castRunner.run).not.toHaveBeenCalled();
  });

  // ─── Case 4: onAccepted patches casted record (RED) ──────────────────────

  it('Case 4 — onAccepted: second recordCasted called with portalCastId', () => {
    const remoteTransport = makeStubRemoteTransport();

    const imprinter = new ForgeImprinter({
      notify,
      castRunner,
      castLogStore,
      remoteTransport: remoteTransport as any,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    // Invoke the onAccepted callback captured by the transport stub
    expect(remoteTransport.run).toHaveBeenCalledOnce();
    const [, callbacks] = remoteTransport.run.mock.calls[0] as [RemoteCastInput, RemoteCastCallbacks];
    callbacks.onAccepted({ portalCastId: 'srv-forge-1' });

    // recordCasted should now have been called a SECOND time with portalCastId
    expect(castLogStore.recordCasted).toHaveBeenCalledTimes(2);
    const [secondInput, secondOpts] = (castLogStore.recordCasted as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondInput).toMatchObject({
      castId: 'forge-id',
      spellPath: '<forge>',
      portalCastId: 'srv-forge-1',
    });
    expect(secondOpts).toEqual({ remote: true });
  });

  // ─── Case 5: onFailure writes error and notifies (RED) ───────────────────

  it('Case 5 — onFailure: recordError called with remote flag, notify called with message', () => {
    const remoteTransport = makeStubRemoteTransport();

    const imprinter = new ForgeImprinter({
      notify,
      castRunner,
      castLogStore,
      remoteTransport: remoteTransport as any,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    // Invoke the onFailure callback
    expect(remoteTransport.run).toHaveBeenCalledOnce();
    const [, callbacks] = remoteTransport.run.mock.calls[0] as [RemoteCastInput, RemoteCastCallbacks];
    callbacks.onFailure('Portal returned 500: boom.');

    // recordError called with remote flag
    expect(castLogStore.recordError).toHaveBeenCalledOnce();
    const [errorInput, errorOpts] = (castLogStore.recordError as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(errorInput).toMatchObject({
      castId: 'forge-id',
      message: 'Portal returned 500: boom.',
    });
    expect(errorOpts).toEqual({ remote: true });

    // notify called with the failure message
    expect(notify).toHaveBeenCalledWith('Portal returned 500: boom.');
  });
});
