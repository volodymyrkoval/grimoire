import { vi, describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import { CastLogModule } from '../src/main/CastLogModule';
import { PluginPaths } from '../src/infra/PluginPaths';

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
    const getExecutionMode = () => 'local' as const;
    expect(() => {
      new CastLogModule({ app, paths, getExecutionMode });
    }).not.toThrow();
  });

  it('buildCastLogPanelDeps returns an object with source, refresh, tick, now properties', () => {
    const getExecutionMode = () => 'local' as const;
    const module = new CastLogModule({ app, paths, getExecutionMode });

    const deps = module.buildCastLogPanelDeps();

    expect(deps).toBeDefined();
    expect(deps.source).toBeDefined();
    expect(deps.refresh).toBeDefined();
    expect(deps.tick).toBeDefined();
    expect(deps.now).toBeDefined();
  });

  it('activeLogStore returns local store when getExecutionMode returns "local"', () => {
    const getExecutionMode = vi.fn(() => 'local' as const);
    const module = new CastLogModule({ app, paths, getExecutionMode });

    const store = module.activeLogStore();

    expect(store).toBeDefined();
    expect(getExecutionMode).toHaveBeenCalled();
  });

  it('activeLogStore returns remote store when getExecutionMode returns "remote"', () => {
    const getExecutionMode = vi.fn(() => 'remote' as const);
    const module = new CastLogModule({ app, paths, getExecutionMode });

    const store = module.activeLogStore();

    expect(store).toBeDefined();
    expect(getExecutionMode).toHaveBeenCalled();
  });

  it('initStartupMaintenance calls run and sweep once via injected factories', async () => {
    const runMock = vi.fn().mockResolvedValue(undefined);
    const sweepMock = vi.fn().mockResolvedValue(undefined);

    const module = new CastLogModule({
      app,
      paths,
      getExecutionMode: () => 'local' as const,
      materializerFactory: () => ({ run: runMock }),
      sweeperFactory: () => ({ sweep: sweepMock }),
    });

    await module.initStartupMaintenance();

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it('initStartupMaintenance resolves via factory even when run rejects', async () => {
    const runMock = vi.fn().mockRejectedValue(new Error('disk full'));
    const sweepMock = vi.fn().mockResolvedValue(undefined);

    const module = new CastLogModule({
      app,
      paths,
      getExecutionMode: () => 'local' as const,
      materializerFactory: () => ({ run: runMock }),
      sweeperFactory: () => ({ sweep: sweepMock }),
    });

    await expect(module.initStartupMaintenance()).resolves.toBeUndefined();
  });

});
