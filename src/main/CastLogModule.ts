import type { DataAdapter } from 'obsidian';
import type { App } from 'obsidian';
import type { CastLogWriter } from '../castLog/CastLogWriter';
import { CastLogStore } from '../castLog/store';
import { HookMaterializer } from '../castLog/HookMaterializer';
import { ForgeMaterializer } from '../forge/ForgeMaterializer';
import { RefineMaterializer } from '../refine/RefineMaterializer';
import { ScratchSweeper } from '../castLog/ScratchSweeper';
import { CastLogSource } from '../castLog/CastLogSource';
import { VaultRefreshCoordinator } from '../castLog/VaultRefreshCoordinator';
import { IntervalTickCoordinator } from '../castLog/IntervalTickCoordinator';
import { foldEvents } from '../castLog/foldEvents';
import type { PluginPaths } from '../infra/PluginPaths';
import type { CastLogPanelDeps } from '../ui/tabs/CastLogPanel';
import type { ForgeSystemPromptInput } from '../forge/forgeTemplate';

type MaterializerPorts = {
  adapter: DataAdapter;
  getPluginDirAbs: () => string;
  getLogPathAbs: () => string;
  hooksDir?: string;
};

type SweeperPorts = {
  adapter: DataAdapter;
  getScratchDirAbs: () => string;
};

type ForgeMaterializerPorts = {
  getForgePathAbs: () => string;
  getSettings: () => ForgeSystemPromptInput;
  adapter?: DataAdapter;
};

type RefineMaterializerPorts = {
  getRefinePathAbs: () => string;
  adapter?: DataAdapter;
};

/**
 * Manages cast log storage, source, and coordination with vault refresh and polling timers.
 * All "casted" events write to the local log regardless of execution mode; the remote log is
 * a read-side concern — the portal writes in-progress/done events to it directly, and reads
 * fan it in via the store's getAgentLogPathAbs port.
 */
export class CastLogModule {
  readonly #app: App;
  readonly #paths: PluginPaths;
  readonly #pluginCastLogStore: CastLogStore;
  readonly #materializerFactory: (ports: MaterializerPorts) => { run(): Promise<void> };
  readonly #sweeperFactory: (ports: SweeperPorts) => { sweep(): Promise<void> };
  readonly #forgeMaterializerFactory: (ports: ForgeMaterializerPorts) => { run(): Promise<void> };
  readonly #refineMaterializerFactory: (ports: RefineMaterializerPorts) => { run(): Promise<void> };
  readonly #getSettings: () => ForgeSystemPromptInput;

  constructor(deps: {
    app: App;
    paths: PluginPaths;
    materializerFactory?: (ports: MaterializerPorts) => { run(): Promise<void> };
    sweeperFactory?: (ports: SweeperPorts) => { sweep(): Promise<void> };
    forgeMaterializerFactory?: (ports: ForgeMaterializerPorts) => { run(): Promise<void> };
    refineMaterializerFactory?: (ports: RefineMaterializerPorts) => { run(): Promise<void> };
    getSettings?: () => ForgeSystemPromptInput;
  }) {
    this.#app = deps.app;
    this.#paths = deps.paths;
    this.#materializerFactory = deps.materializerFactory ?? ((ports) => new HookMaterializer(ports));
    this.#sweeperFactory = deps.sweeperFactory ?? ((ports) => new ScratchSweeper(ports));
    this.#forgeMaterializerFactory = deps.forgeMaterializerFactory ?? ((ports) => new ForgeMaterializer(ports));
    this.#refineMaterializerFactory = deps.refineMaterializerFactory ?? ((ports) => new RefineMaterializer(ports));
    this.#getSettings = deps.getSettings ?? (() => ({ spellTag: '', forgeOutputFolder: '', vaultMountPath: '' }));

    const adapter = this.#app.vault.adapter;

    this.#pluginCastLogStore = new CastLogStore({
      adapter,
      getLogPathAbs: () => this.#paths.pluginLogPath(),
      getAgentLogPathAbs: () => this.#paths.agentLogPath(),
    });
  }

  /**
   * Returns the writer for cast-initiation events. Always backed by the local log —
   * `casted` events must never land in the remote log, which is portal-owned.
   */
  activeLogStore(): CastLogWriter {
    return this.#pluginCastLogStore;
  }

  /** Builds all dependencies except openLink callback for the CastLogPanel UI component. */
  buildCastLogPanelDeps(): Omit<CastLogPanelDeps, 'openLink'> {
    const castLogPaths = [
      this.#paths.pluginLogPath(),
      this.#paths.agentLogPath(),
    ];

    return {
      source: new CastLogSource({
        reader: this.#pluginCastLogStore,
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

  /** Runs startup tasks: materializes remote hook scripts, forge spell file, and sweeps stale scratch files. */
  async initStartupMaintenance(): Promise<void> {
    const adapter = this.#app.vault.adapter;

    const remoteMaterializer = this.#materializerFactory({
      adapter,
      getPluginDirAbs: () => this.#paths.pluginDirAbs(),
      getLogPathAbs: () => this.#paths.agentLogPath(),
      hooksDir: 'agent-hooks',
    });

    try {
      await remoteMaterializer.run();
    } catch (e) {
      console.error('HookMaterializer (remote) failed', e);
    }

    const forgeMaterializer = this.#forgeMaterializerFactory({
      adapter,
      getForgePathAbs: () => this.#paths.forgeSpellPathPluginRel(),
      getSettings: this.#getSettings,
    });

    try {
      await forgeMaterializer.run();
    } catch (e) {
      console.error('ForgeMaterializer failed', e);
    }

    const refineMaterializer = this.#refineMaterializerFactory({
      adapter,
      getRefinePathAbs: () => this.#paths.refineSpellPathPluginRel(),
    });

    try {
      await refineMaterializer.run();
    } catch (e) {
      console.error('RefineMaterializer failed', e);
    }

    const sweeper = this.#sweeperFactory({
      adapter,
      getScratchDirAbs: () => this.#paths.scratchDir(),
    });
    sweeper.sweep().catch(console.error);
  }

  /** Re-materializes the forge spell file with current settings. Fire-and-forget safe. */
  materializeForge(): Promise<void> {
    const adapter = this.#app.vault.adapter;
    const forgeMaterializer = this.#forgeMaterializerFactory({
      adapter,
      getForgePathAbs: () => this.#paths.forgeSpellPathPluginRel(),
      getSettings: this.#getSettings,
    });
    return forgeMaterializer.run();
  }
}
