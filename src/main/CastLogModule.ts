import type { DataAdapter } from 'obsidian';
import type { App } from 'obsidian';
import type { CastLogWriter } from '../castLog/CastLogWriter';
import { CastLogStore } from '../castLog/store';
import { HookMaterializer } from '../castLog/HookMaterializer';
import { ScratchSweeper } from '../castLog/ScratchSweeper';
import { CastLogSource } from '../castLog/CastLogSource';
import { VaultRefreshCoordinator } from '../castLog/VaultRefreshCoordinator';
import { IntervalTickCoordinator } from '../castLog/IntervalTickCoordinator';
import { foldEvents } from '../castLog/foldEvents';
import type { PluginPaths } from '../infra/PluginPaths';
import type { CastLogPanelDeps } from '../ui/tabs/CastLogPanel';

type MaterializerPorts = {
  adapter: DataAdapter;
  getPluginDirAbs: () => string;
  getLogPathAbs: () => string;
};

type SweeperPorts = {
  adapter: DataAdapter;
  getScratchDirAbs: () => string;
};

/**
 * Manages cast log storage, source, and coordination with vault refresh and polling timers.
 * Maintains separate in-memory stores for local and remote casts; activeLogStore() routes to the correct one.
 */
export class CastLogModule {
  readonly #app: App;
  readonly #paths: PluginPaths;
  readonly #getExecutionMode: () => 'local' | 'remote';
  readonly #localCastLogStore: CastLogStore;
  readonly #remoteCastLogStore: CastLogStore;
  readonly #materializerFactory: (ports: MaterializerPorts) => { run(): Promise<void> };
  readonly #sweeperFactory: (ports: SweeperPorts) => { sweep(): Promise<void> };

  constructor(deps: {
    app: App;
    paths: PluginPaths;
    getExecutionMode: () => 'local' | 'remote';
    materializerFactory?: (ports: MaterializerPorts) => { run(): Promise<void> };
    sweeperFactory?: (ports: SweeperPorts) => { sweep(): Promise<void> };
  }) {
    this.#app = deps.app;
    this.#paths = deps.paths;
    this.#getExecutionMode = deps.getExecutionMode;
    this.#materializerFactory = deps.materializerFactory ?? ((ports) => new HookMaterializer(ports));
    this.#sweeperFactory = deps.sweeperFactory ?? ((ports) => new ScratchSweeper(ports));

    const adapter = this.#app.vault.adapter;

    this.#localCastLogStore = new CastLogStore({
      adapter,
      getLogPathAbs: () => this.#paths.localLogPath(),
      getRemoteLogPathAbs: () => this.#paths.remoteLogPath(),
    });

    this.#remoteCastLogStore = new CastLogStore({
      adapter,
      getLogPathAbs: () => this.#paths.remoteLogPath(),
    });
  }

  /** Routes to the active log store (local or remote) based on current execution mode. */
  activeLogStore(): CastLogWriter {
    return this.#getExecutionMode() === 'remote'
      ? this.#remoteCastLogStore
      : this.#localCastLogStore;
  }

  /** Builds all dependencies except openLink callback for the CastLogPanel UI component. */
  buildCastLogPanelDeps(): Omit<CastLogPanelDeps, 'openLink'> {
    const castLogPaths = [
      this.#paths.localLogPath(),
      this.#paths.remoteLogPath(),
    ];

    return {
      source: new CastLogSource({
        reader: this.#localCastLogStore,
        foldEvents,
      }),
      refresh: new VaultRefreshCoordinator({
        adapter: this.#app.vault.adapter,
        vault: this.#app.vault,
        watchedVaultPaths: castLogPaths,
        watchedAbsPaths: castLogPaths,
        pollIntervalMs: 1500,
        debounceMs: 50,
        settlingWindowMs: 3000,
      }),
      tick: new IntervalTickCoordinator({ intervalMs: 1000 }),
      now: () => new Date(),
    };
  }

  /** Runs startup tasks: materializes missing cast log from git hooks, sweeps stale scratch files. */
  async initStartupMaintenance(): Promise<void> {
    const adapter = this.#app.vault.adapter;

    const materializer = this.#materializerFactory({
      adapter,
      getPluginDirAbs: () => this.#paths.pluginDirAbs(),
      getLogPathAbs: () => this.#paths.localLogPath(),
    });

    try {
      await materializer.run();
    } catch (e) {
      console.error('HookMaterializer failed', e);
    }

    const sweeper = this.#sweeperFactory({
      adapter,
      getScratchDirAbs: () => this.#paths.scratchDir(),
    });
    sweeper.sweep().catch(console.error);
  }
}
