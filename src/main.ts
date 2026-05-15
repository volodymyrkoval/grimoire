import { Plugin, Notice, normalizePath } from 'obsidian';
import { GrimoireData } from './domain/settings/Settings';
import { hydrate } from './domain/settings/persistence';
import { DebouncedSaver } from './infra/DebouncedSaver';
import { SpellOverrideStore } from './domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from './ui/options/OptionsSessionMap';
import { GrimoireSettingTab } from './ui/settings/GrimoireSettingTab';
import { CommandPopup } from './ui/CommandPopup';
import { ForgeImprinter } from './forge/ForgeImprinter';
import { CastDispatcher } from './cast/CastDispatcher';
import { createCaster } from './cast/createCaster';
import { CastLogStore } from './castLog/store';
import { HookMaterializer } from './castLog/HookMaterializer';
import { ScratchSweeper } from './castLog/ScratchSweeper';
import { CastLogSource } from './castLog/CastLogSource';
import { VaultRefreshCoordinator } from './castLog/VaultRefreshCoordinator';
import { IntervalTickCoordinator } from './castLog/IntervalTickCoordinator';
import { foldEvents } from './castLog/foldEvents';
import type { CastLogPanelDeps } from './ui/tabs/CastLogPanel';

export default class GrimoirePlugin extends Plugin {
  data!: GrimoireData;
  saver!: DebouncedSaver;
  overrides!: SpellOverrideStore;
  #localCastLogStore!: CastLogStore;
  #remoteCastLogStore!: CastLogStore;
  #pluginDir!: string;

  get #activeLogStore(): CastLogStore {
    return this.data.settings.executionMode === 'remote' ? this.#remoteCastLogStore : this.#localCastLogStore;
  }

  async onload(): Promise<void> {
    await this.#initCore();
    this.#initPluginDir();
    this.#initCastLog();
    await this.#runStartupMaintenance();
    this.#registerUI(...this.#initImprinter());
  }

  onunload(): void {
    this.saver.flush();
  }

  save(): void { this.saver.schedule(); }

  async #initCore(): Promise<void> {
    this.data = hydrate(await this.loadData(), this.app);
    this.saver = new DebouncedSaver(() => this.saveData(this.data), 500);
    this.overrides = new SpellOverrideStore({ data: this.data, saver: this.saver });
  }

  #initPluginDir(): void {
    this.#pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/grimoire`;
  }

  #initCastLog(): void {
    const adapter = this.app.vault.adapter;
    const pluginDir = this.#pluginDir;
    this.#localCastLogStore = new CastLogStore({
      adapter,
      getLogPathAbs: () => normalizePath(`${pluginDir}/cast-log-local.jsonl`),
      getRemoteLogPathAbs: () => normalizePath(`${pluginDir}/cast-log-remote.jsonl`),
    });
    this.#remoteCastLogStore = new CastLogStore({
      adapter,
      getLogPathAbs: () => normalizePath(`${pluginDir}/cast-log-remote.jsonl`),
    });
  }

  async #runStartupMaintenance(): Promise<void> {
    const adapter = this.app.vault.adapter;
    const pluginDir = this.#pluginDir;
    const materializer = new HookMaterializer({
      adapter,
      getPluginDirAbs: () => pluginDir,
      getLogPathAbs: () => normalizePath(`${pluginDir}/cast-log-local.jsonl`),
    });
    try {
      await materializer.run();
    } catch (e) {
      console.error('HookMaterializer failed', e);
    }
    const sweeper = new ScratchSweeper({
      adapter,
      getScratchDirAbs: () => normalizePath(`${pluginDir}/cast-log-scratch`),
    });
    sweeper.sweep().catch(console.error);
  }

  #initImprinter(): [OptionsSessionMap, ForgeImprinter] {
    const sessionMap = new OptionsSessionMap();
    const imprinter = new ForgeImprinter({
      notify: (msg) => { new Notice(msg); },
      caster: () => createCaster(this.data.settings),
      logWriter: () => this.#activeLogStore,
    });
    return [sessionMap, imprinter];
  }

  #registerUI(sessionMap: OptionsSessionMap, imprinter: ForgeImprinter): void {
    this.addSettingTab(new GrimoireSettingTab(this.app, this));
    this.addCommand({
      id: 'open-popup',
      name: 'Open spell browser',
      callback: () => this.#openCommandPopup(sessionMap, imprinter),
    });
  }

  #openCommandPopup(sessionMap: OptionsSessionMap, imprinter: ForgeImprinter): void {
    // close is captured by reference — popup and dispatcher are assigned before either close can fire.
    const closeRef = { close: () => {} };
    const dispatcher = this.#createDispatcher(closeRef);
    const popup = this.#createCommandPopup(sessionMap, imprinter, dispatcher, closeRef);
    closeRef.close = () => popup.close();
    popup.open();
  }

  #createDispatcher(closeRef: { close: () => void }): CastDispatcher {
    return new CastDispatcher({
      notify: (msg) => { new Notice(msg); },
      close: () => closeRef.close(),
      caster: () => createCaster(this.data.settings),
      logWriter: () => this.#activeLogStore,
    });
  }

  #createCommandPopup(
    sessionMap: OptionsSessionMap,
    imprinter: ForgeImprinter,
    dispatcher: CastDispatcher,
    closeRef: { close: () => void },
  ): CommandPopup {
    return new CommandPopup({
      app: this.app,
      spellTag: this.data.settings.spellTag,
      imprintAction: (snapshot) => imprinter.imprint(snapshot, this.data.settings, () => closeRef.close()),
      castAction: (spell, snap) => dispatcher.dispatch({
        spell,
        model: snap.model,
        effort: snap.effort,
        contextNotePaths: snap.contextNotePaths,
        followUp: snap.followUp,
        settings: this.data.settings,
        activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
        executeOnNote: snap.executeOnNote,
      }),
      defaults: { defaultModel: this.data.settings.defaultModel, defaultEffort: this.data.settings.defaultEffort },
      overrides: this.overrides,
      sessionMap,
      castLogPanelDeps: this.#buildCastLogPanelDeps(),
    });
  }

  #buildCastLogPanelDeps(): Omit<CastLogPanelDeps, 'openLink'> {
    const pluginDir = this.#pluginDir;
    const castLogPaths = [
      normalizePath(`${pluginDir}/cast-log-local.jsonl`),
      normalizePath(`${pluginDir}/cast-log-remote.jsonl`),
    ];
    return {
      source: new CastLogSource({ reader: this.#localCastLogStore, foldEvents }),
      refresh: new VaultRefreshCoordinator({
        adapter: this.app.vault.adapter,
        vault: this.app.vault,
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
}
