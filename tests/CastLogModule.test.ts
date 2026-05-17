import { modelId } from '../src/domain/settings/ModelId';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import { CastLogModule } from '../src/main/CastLogModule';
import { PluginPaths } from '../src/infra/PluginPaths';
import type { ForgeSystemPromptInput } from '../src/forge/forgeTemplate';

vi.mock('../src/domain/settings/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/vault'),
}));

describe('CastLogModule', () => {
  let app: App;
  let paths: PluginPaths;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new App();
    paths = new PluginPaths('.obsidian/plugins/grimoire');
  });

  it('constructs without throwing', () => {
    expect(() => {
      new CastLogModule({ app, paths });
    }).not.toThrow();
  });

  it('buildCastLogPanelDeps returns an object with source, refresh, tick, now properties', () => {
    const module = new CastLogModule({ app, paths });

    const deps = module.buildCastLogPanelDeps();

    expect(deps).toBeDefined();
    expect(deps.source).toBeDefined();
    expect(deps.refresh).toBeDefined();
    expect(deps.tick).toBeDefined();
    expect(deps.now).toBeDefined();
  });

  it('activeLogStore writes recordCasted to pluginLogPath (and never to agentLogPath)', async () => {
    const module = new CastLogModule({ app, paths });

    await module.activeLogStore().recordCasted({
      castId: 'c1',
      spellPath: 'Spells/T.md',
      model: modelId('m'),
      effort: null,
      contextNotes: [],
    });

    const writeMock = vi.mocked(app.vault.adapter.write);
    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock.mock.calls[0][0]).toBe(paths.pluginLogPath());
    expect(writeMock.mock.calls[0][0]).not.toBe(paths.agentLogPath());
  });

  it('initStartupMaintenance calls run once (agent-hooks) and sweep once via injected factories', async () => {
    const runMock = vi.fn().mockResolvedValue(undefined);
    const sweepMock = vi.fn().mockResolvedValue(undefined);

    const module = new CastLogModule({
      app,
      paths,
      materializerFactory: () => ({ run: runMock }),
      sweeperFactory: () => ({ sweep: sweepMock }),
    });

    await module.initStartupMaintenance();

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it('initStartupMaintenance calls materializerFactory once with agent-hooks config', async () => {
    const runMock = vi.fn().mockResolvedValue(undefined);
    const factorySpy = vi.fn(() => ({ run: runMock }));

    const module = new CastLogModule({
      app,
      paths,
      materializerFactory: factorySpy,
      sweeperFactory: () => ({ sweep: vi.fn().mockResolvedValue(undefined) }),
    });

    await module.initStartupMaintenance();

    expect(factorySpy).toHaveBeenCalledTimes(1);

    const callPorts = factorySpy.mock.calls[0][0];
    expect(callPorts.getLogPathAbs()).toBe(paths.agentLogPath());
    expect(callPorts.hooksDir).toBe('agent-hooks');
  });

  it('initStartupMaintenance resolves via factory even when run rejects', async () => {
    const runMock = vi.fn().mockRejectedValue(new Error('disk full'));
    const sweepMock = vi.fn().mockResolvedValue(undefined);

    const module = new CastLogModule({
      app,
      paths,
      materializerFactory: () => ({ run: runMock }),
      sweeperFactory: () => ({ sweep: sweepMock }),
    });

    await expect(module.initStartupMaintenance()).resolves.toBeUndefined();
  });

  it('initStartupMaintenance invokes forgeMaterializerFactory once and awaits its run()', async () => {
    const forgeRunMock = vi.fn().mockResolvedValue(undefined);
    const forgeMaterializerFactorySpy = vi.fn(() => ({ run: forgeRunMock }));
    const getSettings = vi.fn<[], ForgeSystemPromptInput>(() => ({
      spellTag: '#spell',
      forgeOutputFolder: 'Spells',
      vaultMountPath: '/vault',
    }));

    const module = new CastLogModule({
      app,
      paths,
      materializerFactory: () => ({ run: vi.fn().mockResolvedValue(undefined) }),
      sweeperFactory: () => ({ sweep: vi.fn().mockResolvedValue(undefined) }),
      forgeMaterializerFactory: forgeMaterializerFactorySpy,
      getSettings,
    });

    await module.initStartupMaintenance();

    expect(forgeMaterializerFactorySpy).toHaveBeenCalledTimes(1);
    expect(forgeRunMock).toHaveBeenCalledTimes(1);
  });

  it('rejection in the forge materializer is caught and logged, plugin still loads', async () => {
    const forgeRunMock = vi.fn().mockRejectedValue(new Error('forge disk full'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const module = new CastLogModule({
      app,
      paths,
      materializerFactory: () => ({ run: vi.fn().mockResolvedValue(undefined) }),
      sweeperFactory: () => ({ sweep: vi.fn().mockResolvedValue(undefined) }),
      forgeMaterializerFactory: () => ({ run: forgeRunMock }),
      getSettings: () => ({ spellTag: '#spell', forgeOutputFolder: 'Spells', vaultMountPath: '/vault' }),
    });

    await expect(module.initStartupMaintenance()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ForgeMaterializer'), expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('initStartupMaintenance invokes refineMaterializerFactory once and awaits its run()', async () => {
    const refineRunMock = vi.fn().mockResolvedValue(undefined);
    const refineMaterializerFactorySpy = vi.fn(() => ({ run: refineRunMock }));

    const module = new CastLogModule({
      app,
      paths,
      materializerFactory: () => ({ run: vi.fn().mockResolvedValue(undefined) }),
      sweeperFactory: () => ({ sweep: vi.fn().mockResolvedValue(undefined) }),
      forgeMaterializerFactory: () => ({ run: vi.fn().mockResolvedValue(undefined) }),
      refineMaterializerFactory: refineMaterializerFactorySpy,
      getSettings: () => ({ spellTag: '#spell', forgeOutputFolder: 'Spells', vaultMountPath: '/vault' }),
    });

    await module.initStartupMaintenance();

    expect(refineMaterializerFactorySpy).toHaveBeenCalledTimes(1);
    expect(refineRunMock).toHaveBeenCalledTimes(1);
  });

  it('rejection in the refine materializer is caught and logged, plugin still loads', async () => {
    const refineRunMock = vi.fn().mockRejectedValue(new Error('refine disk full'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const module = new CastLogModule({
      app,
      paths,
      materializerFactory: () => ({ run: vi.fn().mockResolvedValue(undefined) }),
      sweeperFactory: () => ({ sweep: vi.fn().mockResolvedValue(undefined) }),
      forgeMaterializerFactory: () => ({ run: vi.fn().mockResolvedValue(undefined) }),
      refineMaterializerFactory: () => ({ run: refineRunMock }),
      getSettings: () => ({ spellTag: '#spell', forgeOutputFolder: 'Spells', vaultMountPath: '/vault' }),
    });

    await expect(module.initStartupMaintenance()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('RefineMaterializer'), expect.any(Error));

    consoleSpy.mockRestore();
  });

});
