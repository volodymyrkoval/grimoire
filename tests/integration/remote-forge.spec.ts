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
import { buildForgeUserPrompt } from '../../src/forge/buildForgeUserPrompt';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const FORGE_VAULT_REL = '.obsidian/plugins/grimoire/forge.md';

function makeForgeSpellPaths(vaultMountPath: string) {
  return () => ({
    absForCaster: `${vaultMountPath}/${FORGE_VAULT_REL}`,
    vaultRelForPortal: FORGE_VAULT_REL,
  });
}

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
      forgeSpellPaths: makeForgeSpellPaths(localSettings.vaultMountPath),
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
      forgeSpellPaths: makeForgeSpellPaths(emptyHostSettings.vaultMountPath),
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
      forgeSpellPaths: makeForgeSpellPaths(remoteSettings.vaultMountPath),
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
      forgeSpellPaths: makeForgeSpellPaths(remoteSettings.vaultMountPath),
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    await vi.waitFor(() => {
      expect(logWriter.recordCasted).toHaveBeenCalledTimes(2);
    });

    expect(logWriter.recordCasted).toHaveBeenLastCalledWith(
      expect.objectContaining({ castId: 'forge-id', portalCastId: 'srv-forge-1' })
    );
  });

  // ─── Case 5: HTTP body carries vault-relative forge spellPath and small userPrompt ──

  it('Case 5 — remote forge: HTTP body carries vault-relative spellPath and small per-cast userPrompt', () => {
    // After the forge-spell-materialization refactor the portal receives:
    //   spellPath: '.obsidian/plugins/grimoire/forge.md'  (vault-relative file lookup key)
    //   userPrompt: the small per-cast block built by buildForgeUserPrompt
    // System-prompt content (Execution Mode callout etc.) must NOT appear in
    // the wire body — it lives inside the materialized forge.md on disk.
    vi.mocked(requestUrl).mockResolvedValue({ status: 202, text: '', json: {} });

    const forgeSpellPaths = () => ({
      absForCaster: `${remoteSettings.vaultMountPath}/.obsidian/plugins/grimoire/forge.md`,
      vaultRelForPortal: '.obsidian/plugins/grimoire/forge.md',
    });

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(remoteSettings),
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
      forgeSpellPaths,
    });

    imprinter.imprint(snapshot, remoteSettings, close);

    expect(vi.mocked(requestUrl)).toHaveBeenCalledOnce();
    const reqArg = vi.mocked(requestUrl).mock.calls[0][0];
    const parsedBody = JSON.parse(reqArg.body as string);

    // Portal receives the vault-relative forge file path as the spell lookup key
    expect(parsedBody.spellPath).toBe('.obsidian/plugins/grimoire/forge.md');

    // System-prompt content must not leak into the per-cast user prompt
    expect(parsedBody.userPrompt).not.toContain('Execution Mode');

    // Per-cast values (description and sanitised name) are present in the user prompt
    expect(parsedBody.userPrompt).toContain(snapshot.description);
    expect(parsedBody.userPrompt).toContain(snapshot.name);
  });

  // ─── Case 7: local forge — CastRunner receives systemPromptFile from forge.md ──

  it('Case 7 — local forge: CastRunner.prototype.run receives systemPromptFile pointing at forge.md and small userPrompt', () => {
    // After the forge-spell-materialization refactor, local forge passes:
    //   systemPromptFile: '<vaultMountPath>/.obsidian/plugins/grimoire/forge.md'
    //   userPrompt:       buildForgeUserPrompt(snapshot)   (the small per-cast block)
    // This asserts the same file-based split as the remote branch — one code path
    // in ForgeImprinter, no if-local/if-remote divergence on prompt assembly.
    const vaultMountPath = localSettings.vaultMountPath;
    const expectedAbsPath = `${vaultMountPath}/.obsidian/plugins/grimoire/forge.md`;

    const forgeSpellPaths = () => ({
      absForCaster: expectedAbsPath,
      vaultRelForPortal: '.obsidian/plugins/grimoire/forge.md',
    });

    const runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(localSettings),
      logWriter: () => logWriter,
      generateId: () => 'local-forge-id',
      forgeSpellPaths,
    });

    imprinter.imprint(snapshot, localSettings, close);

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0];

    // systemPromptFile points at the materialized forge.md — the full absolute path
    expect((runInput as any).systemPromptFile).toBe(expectedAbsPath);

    // userPrompt is exactly the small per-cast block, not the full meta-spell
    const expectedUserPrompt = buildForgeUserPrompt({
      description: snapshot.description,
      name: snapshot.name,
      model: snapshot.model,
      effort: snapshot.effort,
      executeOnNote: snapshot.executeOnNote,
    });
    expect((runInput as any).userPrompt).toBe(expectedUserPrompt);

    runSpy.mockRestore();
  });

  // ─── Case 6: onFailure — recordError + notify ─────────────────────────────

  it('Case 6 — onFailure: recordError called, notify called with mapped message', async () => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 500, text: 'Server error', json: null });

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(remoteSettings),
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
      forgeSpellPaths: makeForgeSpellPaths(remoteSettings.vaultMountPath),
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

  // ─── Case 8: empty vaultMountPath — spellPath still vault-relative ──────────

  it('Case 8 — empty vaultMountPath: spellPath sent over wire is still vault-relative, no empty prefix leaked', () => {
    // Edge case: when vaultMountPath is empty (degraded mode for local forge),
    // the forgeSpellPaths thunk returns { absForCaster, vaultRelForPortal }.
    // The remote branch must use vaultRelForPortal consistently — we must NOT
    // accidentally inline the empty vaultMountPath prefix.
    // This test guards against a regression where an empty prefix could create
    // a path like '/.obsidian/plugins/grimoire/forge.md' or similar.
    vi.mocked(requestUrl).mockResolvedValue({ status: 202, text: '', json: {} });

    const emptyVaultSettings: GrimoireSettings = { ...remoteSettings, vaultMountPath: '' };

    const forgeSpellPaths = () => ({
      absForCaster: '/.obsidian/plugins/grimoire/forge.md', // empty mount + path
      vaultRelForPortal: '.obsidian/plugins/grimoire/forge.md', // still vault-relative
    });

    const imprinter = new ForgeImprinter({
      notify,
      caster: () => createCaster(emptyVaultSettings),
      logWriter: () => logWriter,
      generateId: () => 'case8-id',
      forgeSpellPaths,
    });

    imprinter.imprint(snapshot, emptyVaultSettings, close);

    expect(vi.mocked(requestUrl)).toHaveBeenCalledOnce();
    const reqArg = vi.mocked(requestUrl).mock.calls[0][0];
    const parsedBody = JSON.parse(reqArg.body as string);

    // The spellPath sent to portal is exactly the vault-relative form, no empty prefix leaked
    expect(parsedBody.spellPath).toBe('.obsidian/plugins/grimoire/forge.md');
    // It should NOT be the absolute form with a leading slash
    expect(parsedBody.spellPath).not.toBe('/.obsidian/plugins/grimoire/forge.md');
  });
});
