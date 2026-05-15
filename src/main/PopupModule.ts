import { Notice, type Plugin } from 'obsidian';
import type { App } from 'obsidian';
import type { GrimoireData } from '../domain/settings/Settings';
import type { SpellOverrideStore } from '../domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../ui/options/OptionsSessionMap';
import { ForgeImprinter } from '../forge/ForgeImprinter';
import { CastDispatcher } from '../cast/CastDispatcher';
import { createCaster } from '../cast/createCaster';
import { CommandPopupBuilder } from '../ui/popup/CommandPopupBuilder';
import type { CastLogModule } from './CastLogModule';

export class PopupModule {
  readonly #app: App;
  readonly #getData: () => GrimoireData;
  readonly #overrides: SpellOverrideStore;
  readonly #castLog: CastLogModule;
  readonly #sessionMap: OptionsSessionMap;
  readonly #imprinter: ForgeImprinter;

  constructor(deps: {
    app: App;
    getData: () => GrimoireData;
    overrides: SpellOverrideStore;
    castLog: CastLogModule;
  }) {
    this.#app = deps.app;
    this.#getData = deps.getData;
    this.#overrides = deps.overrides;
    this.#castLog = deps.castLog;

    this.#sessionMap = new OptionsSessionMap();
    this.#imprinter = new ForgeImprinter({
      notify: (msg) => { new Notice(msg); },
      caster: () => createCaster(this.#getData().settings),
      logWriter: () => this.#castLog.activeLogStore(),
    });
  }

  register(plugin: Plugin): void {
    plugin.addCommand({
      id: 'open-popup',
      name: 'Open spell browser',
      callback: () => this.#openPopup(),
    });
  }

  #openPopup(): void {
    new CommandPopupBuilder({
      app: this.#app,
      plugin: { data: this.#getData(), overrides: this.#overrides },
      imprinter: this.#imprinter,
      sessionMap: this.#sessionMap,
      castLogPanelDeps: this.#castLog.buildCastLogPanelDeps(),
      createDispatcher: (close) => new CastDispatcher({
        notify: (msg) => { new Notice(msg); },
        close,
        caster: () => createCaster(this.#getData().settings),
        logWriter: () => this.#castLog.activeLogStore(),
      }),
    }).build().open();
  }
}
