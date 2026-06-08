import { Notice, type Plugin } from 'obsidian';
import type { App } from 'obsidian';
import type { GrimoireData, Effort } from '../domain/settings/Settings';
import type { SpellOverrideStore } from '../domain/settings/SpellOverrideStore';
import type { ModelId } from '../domain/settings/ModelId';
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
import type { CastingFrontmatterReader, CastingFrontmatterWriter } from '../infra/castingFrontmatter';
import type { PortalSecret } from '../infra/PortalSecret';
import type { Logger } from '../infra/Logger';

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
  readonly #castingReader: CastingFrontmatterReader;
  readonly #castingWriter: CastingFrontmatterWriter;
  readonly #setVaultDefault: (model: ModelId, effort: Effort | null) => void;
  readonly #secret: PortalSecret;
  readonly #logger: Logger | undefined;

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
    castingReader: CastingFrontmatterReader;
    castingWriter: CastingFrontmatterWriter;
    /** Writes vault-wide default model/effort to plugin settings. */
    setVaultDefault: (model: ModelId, effort: Effort | null) => void;
    secret: PortalSecret;
    /** Logger for diagnostic output. Optional — no-op when omitted. */
    logger?: Logger;
  }) {
    this.#app = deps.app;
    this.#getData = deps.getData;
    this.#overrides = deps.overrides;
    this.#castLog = deps.castLog;
    this.#getAgentHooksDirAbs = deps.getAgentHooksDirAbs;
    this.#paths = deps.paths;
    this.#spellContentReader = deps.spellContentReader;
    this.#castingReader = deps.castingReader;
    this.#castingWriter = deps.castingWriter;
    this.#setVaultDefault = deps.setVaultDefault;
    this.#secret = deps.secret;
    this.#logger = deps.logger;

    this.#registry = PopupModule.#buildRegistry();
    this.#sessionMap = new OptionsSessionMap();
    this.#imprinter = new ForgeImprinter({
      notify: (msg) => { new Notice(msg); },
      caster: () => createCaster(this.#getData().settings, this.#secret, this.#getAgentHooksDirAbs(), this.#logger),
      logWriter: () => this.#castLog.activeLogStore(),
      forgeSpellPaths: deps.forgeSpellPaths,
      logger: this.#logger,
    });
    this.#updateImprinter = new ForgeUpdateImprinter({
      notify: (msg) => { new Notice(msg); },
      caster: () => createCaster(this.#getData().settings, this.#secret, this.#getAgentHooksDirAbs(), this.#logger),
      logWriter: () => this.#castLog.activeLogStore(),
      forgeUpdateSpellPaths: deps.forgeUpdateSpellPaths,
      logger: this.#logger,
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
        caster: () => createCaster(this.#getData().settings, this.#secret, this.#getAgentHooksDirAbs(), this.#logger),
        logWriter: () => this.#castLog.activeLogStore(),
        logger: this.#logger,
      }),
      paths: this.#paths,
      castingReader: this.#castingReader,
      castingWriter: this.#castingWriter,
      setVaultDefault: this.#setVaultDefault,
      logger: this.#logger,
    }).build().open();
  }
}
