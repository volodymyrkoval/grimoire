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

/**
 * Owns the spell browser popup and its lifecycle: opens the popup command,
 * constructs the popup UI with all dependencies, and manages session-level form state.
 */
export class PopupModule {
  readonly #app: App;
  readonly #getData: () => GrimoireData;
  readonly #overrides: SpellOverrideStore;
  readonly #castLog: CastLogModule;
  readonly #getAgentHooksDirAbs: () => string;
  readonly #sessionMap: OptionsSessionMap;
  readonly #imprinter: ForgeImprinter;

  constructor(deps: {
    app: App;
    getData: () => GrimoireData;
    overrides: SpellOverrideStore;
    castLog: CastLogModule;
    getAgentHooksDirAbs: () => string;
  }) {
    this.#app = deps.app;
    this.#getData = deps.getData;
    this.#overrides = deps.overrides;
    this.#castLog = deps.castLog;
    this.#getAgentHooksDirAbs = deps.getAgentHooksDirAbs;

    this.#sessionMap = new OptionsSessionMap();
    this.#imprinter = new ForgeImprinter({
      notify: (msg) => { new Notice(msg); },
      caster: () => createCaster(this.#getData().settings, this.#getAgentHooksDirAbs()),
      logWriter: () => this.#castLog.activeLogStore(),
    });
  }

  /** Registers the "Open spell browser" command with the plugin. */
  register(plugin: Plugin): void {
    plugin.addCommand({
      id: 'open-popup',
      name: 'Open spell browser',
      callback: () => this.#openPopup(),
    });
  }

  /** Opens the spell browser popup, building all UI and dependencies fresh. */
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
        caster: () => createCaster(this.#getData().settings, this.#getAgentHooksDirAbs()),
        logWriter: () => this.#castLog.activeLogStore(),
      }),
    }).build().open();
  }
}
