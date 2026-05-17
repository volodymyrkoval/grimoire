import { modelId } from '../../src/domain/settings/ModelId';
import { describe, it, expect, vi } from 'vitest';
import { createCaster } from '../../src/cast/createCaster';
import { CastRunner } from '../../src/cast/local/CastRunner';
import { requestUrl } from 'obsidian';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';
import type { CastInput, CastCallbacks } from '../../src/cast/Caster';

const localSettings: GrimoireSettings = {
  spellTag: 'grimoire/spell',
  cliCommand: 'claude',
  binaryPath: '',
  forgeOutputFolder: 'Spells/',
  vaultMountPath: '/vault',
  defaultModel: modelId('claude-sonnet-4-5'),
  defaultEffort: 'medium',
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
  portalHost: 'localhost',
  portalPort: '8080',
  portalPath: '/cast',
  portalAuthUser: 'user',
  portalAuthPassword: 'pass',
};

const baseCastInput: CastInput = {
  castId: 'cast-1',
  spellPath: 'spell.md',
  modelId: modelId('claude-sonnet-4-5'),
  effort: 'medium',
  userPrompt: 'Hello',
  vaultMountPath: '/vault',
};

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('createCaster', () => {
  it('local mode: returns a Caster that invokes CastRunner.run', () => {
    const runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});

    const caster = createCaster(localSettings);
    caster.cast(baseCastInput, { onAccepted: vi.fn(), onFailure: vi.fn() });

    expect(runSpy).toHaveBeenCalledOnce();
    runSpy.mockRestore();
  });

  it('remote mode: returns a Caster that calls requestUrl', async () => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 202, json: {}, text: '' });

    const caster = createCaster(remoteSettings);
    caster.cast(baseCastInput, { onAccepted: vi.fn(), onFailure: vi.fn() });
    await flushPromises();

    expect(vi.mocked(requestUrl)).toHaveBeenCalledOnce();
  });

  it('remote mode: constructs RemoteCaster without getRemoteHooksDirAbs', async () => {
    const RemoteCasterModule = await import('../../src/cast/portal/RemoteCaster');
    const remoteCasterSpy = vi.spyOn(RemoteCasterModule, 'RemoteCaster').mockImplementation(function() {
      return { cast: vi.fn() };
    } as any);

    createCaster(remoteSettings);

    expect(remoteCasterSpy).toHaveBeenCalledOnce();
    const constructedWith = remoteCasterSpy.mock.calls[0][0] as any;
    expect(constructedWith).not.toHaveProperty('getRemoteHooksDirAbs');

    remoteCasterSpy.mockRestore();
  });

  it('returns an object with a cast method', () => {
    const runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});
    const caster = createCaster(localSettings);
    expect(typeof caster.cast).toBe('function');
    runSpy.mockRestore();
  });
});
