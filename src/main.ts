import { Plugin } from 'obsidian';
import { GrimoireData } from './domain/settings/Settings';
import { hydrate } from './domain/settings/persistence';
import { DebouncedSaver } from './infra/DebouncedSaver';
import { PluginPaths } from './infra/PluginPaths';
import { SpellOverrideStore } from './domain/settings/SpellOverrideStore';
import { GrimoireSettingTab } from './ui/settings/GrimoireSettingTab';
import { CastLogModule } from './main/CastLogModule';
import { PopupModule } from './main/PopupModule';

/**
 * Obsidian plugin entry point for Grimoire (spell management and casting).
 * Lifecycle: onload (initializes data, cast log, and UI) → onunload (flushes pending saves).
 */
export default class GrimoirePlugin extends Plugin {
  data!: GrimoireData;
  saver!: DebouncedSaver;
  overrides!: SpellOverrideStore;

  /** Initializes plugin data, cast log, UI panels, and settings tab. */
  async onload(): Promise<void> {
    await this.#loadPluginData();
    const paths = this.#buildPaths();
    const castLog = await this.#initCastLog(paths);
    const popupModule = this.#buildPopupModule(castLog);
    this.#registerUI(popupModule);
  }

  async #loadPluginData(): Promise<void> {
    await this.loadData().then((saved) => {
      this.data = hydrate(saved, this.app);
    });
    this.saver = new DebouncedSaver(() => this.saveData(this.data), 500);
    this.overrides = new SpellOverrideStore({ data: this.data, saver: this.saver });
  }

  #buildPaths(): PluginPaths {
    const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/grimoire`;
    return new PluginPaths(pluginDir);
  }

  async #initCastLog(paths: PluginPaths): Promise<CastLogModule> {
    const castLog = new CastLogModule({
      app: this.app,
      paths,
      getExecutionMode: () => this.data.settings.executionMode,
    });
    await castLog.initStartupMaintenance();
    return castLog;
  }

  #buildPopupModule(castLog: CastLogModule): PopupModule {
    return new PopupModule({
      app: this.app,
      getData: () => this.data,
      overrides: this.overrides,
      castLog,
    });
  }

  #registerUI(popupModule: PopupModule): void {
    this.addSettingTab(new GrimoireSettingTab(this.app, this));
    popupModule.register(this);
  }

  /** Flushes any pending saves before shutdown. */
  onunload(): void {
    this.saver.flush();
  }

  /** Schedules a deferred save of the plugin data. */
  save(): void { this.saver.schedule(); }
}
