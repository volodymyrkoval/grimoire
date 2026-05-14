import { Plugin, Notice, FileSystemAdapter } from 'obsidian';
// eslint-disable-next-line obsidianmd/no-nodejs-modules
import * as path from 'node:path';
import { GrimoireData } from './domain/settings/Settings';
import { hydrate } from './domain/settings/persistence';
import { DebouncedSaver } from './infra/DebouncedSaver';
import { SpellOverrideStore } from './domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from './ui/options/OptionsSessionMap';
import { GrimoireSettingTab } from './ui/settings/GrimoireSettingTab';
import { CommandPopup } from './ui/CommandPopup';
import { ForgeImprinter } from './forge/ForgeImprinter';
import { CastRunner } from './cast/CastRunner';
import { CastDispatcher } from './cast/CastDispatcher';
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
  private castLogStore!: CastLogStore;
  private pluginDirAbs!: string;

  async onload(): Promise<void> {
    await this.initCore();
    const basePath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    this.pluginDirAbs = path.join(basePath, this.manifest.dir ?? `${this.app.vault.configDir}/plugins/grimoire`);
    const pluginDirAbs = this.pluginDirAbs;

    this.castLogStore = new CastLogStore({
      getLogPathAbs: () => path.join(pluginDirAbs, 'cast-log-local.jsonl'),
      getRemoteLogPathAbs: () => path.join(pluginDirAbs, 'cast-log-remote.jsonl'),
    });

    const materializer = new HookMaterializer({
      getPluginDirAbs: () => pluginDirAbs,
      getLogPathAbs: () => path.join(pluginDirAbs, 'cast-log-local.jsonl'),
    });
    try {
      await materializer.run();
    } catch (e) {
      console.error('HookMaterializer failed', e);
    }

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => path.join(pluginDirAbs, 'cast-log-scratch'),
    });
    sweeper.sweep().catch(console.error);

    const sessionMap = new OptionsSessionMap();
    const imprinter = new ForgeImprinter({
      notify: (msg) => { new Notice(msg); },
      castRunner: new CastRunner(),
      castLogStore: this.castLogStore,
    });
    this.registerUI(sessionMap, imprinter);
  }

  onunload(): void {
    this.saver.flush();
  }

  save(): void { this.saver.schedule(); }

  private async initCore(): Promise<void> {
    this.data = hydrate(await this.loadData(), this.app);
    this.saver = new DebouncedSaver(() => this.saveData(this.data), 500);
    this.overrides = new SpellOverrideStore({ data: this.data, saver: this.saver });
  }

  private registerUI(sessionMap: OptionsSessionMap, imprinter: ForgeImprinter): void {
    this.addSettingTab(new GrimoireSettingTab(this.app, this));
    this.addCommand({
      id: 'open-popup',
      name: 'Open spell browser',
      callback: () => this.openCommandPopup(sessionMap, imprinter),
    });
  }

  private openCommandPopup(sessionMap: OptionsSessionMap, imprinter: ForgeImprinter): void {
    // close is captured by reference — popup and dispatcher are assigned before either close can fire.
    const closeRef = { close: () => {} };
    const dispatcher = this.createDispatcher(closeRef);
    const popup = this.createCommandPopup(sessionMap, imprinter, dispatcher, closeRef);
    closeRef.close = () => popup.close();
    popup.open();
  }

  private createDispatcher(closeRef: { close: () => void }): CastDispatcher {
    return new CastDispatcher({
      notify: (msg) => { new Notice(msg); },
      close: () => closeRef.close(),
      castRunner: new CastRunner(),
      castLogStore: this.castLogStore,
    });
  }

  private createCommandPopup(
    sessionMap: OptionsSessionMap,
    imprinter: ForgeImprinter,
    dispatcher: CastDispatcher,
    closeRef: { close: () => void },
  ): CommandPopup {
    const pluginDirAbs = this.pluginDirAbs;
    const manifestDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/grimoire`;
    const castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'> = {
      source: new CastLogSource({ reader: this.castLogStore, foldEvents }),
      refresh: new VaultRefreshCoordinator({
        vault: this.app.vault,
        watchedVaultPaths: [
          `${manifestDir}/cast-log-local.jsonl`,
          `${manifestDir}/cast-log-remote.jsonl`,
        ],
        watchedAbsPaths: [
          path.join(pluginDirAbs, 'cast-log-local.jsonl'),
          path.join(pluginDirAbs, 'cast-log-remote.jsonl'),
        ],
        pollIntervalMs: 1500,
        debounceMs: 50,
        settlingWindowMs: 3000,
      }),
      tick: new IntervalTickCoordinator({ intervalMs: 1000 }),
      now: () => new Date(),
    };

    return new CommandPopup({
      app: this.app,
      spellTag: this.data.settings.spellTag,
      imprintAction: (snapshot) => imprinter.imprint(snapshot, this.data.settings, () => closeRef.close()),
      castAction: (spell) => dispatcher.dispatch({
        spell,
        model: this.data.settings.defaultModel,
        effort: this.data.settings.defaultEffort,
        contextNotePaths: [],
        followUp: '',
        settings: this.data.settings,
        activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
        executeOnNote: spell.executeOnNote,
      }),
      defaults: { defaultModel: this.data.settings.defaultModel, defaultEffort: this.data.settings.defaultEffort },
      overrides: this.overrides,
      sessionMap,
      castLogPanelDeps,
      optionsCastAction: (spell, snap) => dispatcher.dispatch({
        spell,
        model: snap.model,
        effort: snap.effort,
        contextNotePaths: snap.contextNotePaths,
        followUp: snap.followUp,
        settings: this.data.settings,
        activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
        executeOnNote: snap.executeOnNote,
      }),
    });
  }
}
