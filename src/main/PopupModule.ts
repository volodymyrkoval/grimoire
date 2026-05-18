import { Notice, type Plugin } from 'obsidian';
import type { App } from 'obsidian';
import type { GrimoireData } from '../domain/settings/Settings';
import type { SpellOverrideStore } from '../domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../ui/options/OptionsSessionMap';
import { ForgeImprinter } from '../forge/ForgeImprinter';
import { ForgeUpdateImprinter } from '../forge/ForgeUpdateImprinter';
import type { SpellContentReader } from '../forge/SpellContentReader';
import { CastDispatcher } from '../cast/CastDispatcher';
import { createCaster } from '../cast/createCaster';
import { CommandPopupBuilder } from '../ui/popup/CommandPopupBuilder';
import { SystemSpellRegistry } from '../castLog/SystemSpellRegistry';
import {
  FORGE_SPELL_PATH,
  REFINE_SPELL_PATH,
  FORGE_UPDATE_SPELL_PATH,
} from '../domain/spells/SystemSpellPaths';
import type { CastLogModule } from './CastLogModule';
import type { PluginPaths } from '../infra/PluginPaths';

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
  readonly #updateImprinter: ForgeUpdateImprinter;
  readonly #spellContentReader: SpellContentReader;
  readonly #paths: PluginPaths;
  readonly #registry: SystemSpellRegistry;

  constructor(deps: {
    app: App;
    getData: () => GrimoireData;
    overrides: SpellOverrideStore;
    castLog: CastLogModule;
    getAgentHooksDirAbs: () => string;
    forgeSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
    forgeUpdateSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
    spellContentReader: SpellContentReader;
    paths: PluginPaths;
  }) {
    this.#app = deps.app;
    this.#getData = deps.getData;
    this.#overrides = deps.overrides;
    this.#castLog = deps.castLog;
    this.#getAgentHooksDirAbs = deps.getAgentHooksDirAbs;
    this.#paths = deps.paths;
    this.#spellContentReader = deps.spellContentReader;

    this.#registry = PopupModule.#buildRegistry();
    this.#sessionMap = new OptionsSessionMap();
    this.#imprinter = new ForgeImprinter({
      notify: (msg) => { new Notice(msg); },
      caster: () => createCaster(this.#getData().settings, this.#getAgentHooksDirAbs()),
      logWriter: () => this.#castLog.activeLogStore(),
      forgeSpellPaths: deps.forgeSpellPaths,
    });
    this.#updateImprinter = new ForgeUpdateImprinter({
      notify: (msg) => { new Notice(msg); },
      caster: () => createCaster(this.#getData().settings, this.#getAgentHooksDirAbs()),
      logWriter: () => this.#castLog.activeLogStore(),
      forgeUpdateSpellPaths: deps.forgeUpdateSpellPaths,
    });
  }

  /** Builds and populates the system spell registry with all known sentinel paths. */
  static #buildRegistry(): SystemSpellRegistry {
    const registry = new SystemSpellRegistry();
    registry.register(FORGE_SPELL_PATH, { label: 'Forge' });
    registry.register(REFINE_SPELL_PATH, { label: 'Refine' });
    registry.register(FORGE_UPDATE_SPELL_PATH, { label: 'Forge (update)' });
    return registry;
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
      updateImprinter: this.#updateImprinter,
      spellContentReader: this.#spellContentReader,
      sessionMap: this.#sessionMap,
      castLogPanelDeps: { ...this.#castLog.buildCastLogPanelDeps(), registry: this.#registry },
      createDispatcher: (close) => new CastDispatcher({
        notify: (msg) => { new Notice(msg); },
        close,
        caster: () => createCaster(this.#getData().settings, this.#getAgentHooksDirAbs()),
        logWriter: () => this.#castLog.activeLogStore(),
      }),
      paths: this.#paths,
    }).build().open();
  }
}
