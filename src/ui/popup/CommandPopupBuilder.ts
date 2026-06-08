import { App, Notice, TFile } from 'obsidian';
import { CommandPopup } from '../CommandPopup';
import type { RefineCastAction, ForgeUpdateAction } from '../CommandPopup';
import type { CastAction, ImprintAction } from '../CommandPopup';
import { obsidianRanker } from '../../infra/obsidianRanker';
import type { ForgeImprinter } from '../../forge/ForgeImprinter';
import type { ForgeUpdateImprinter } from '../../forge/ForgeUpdateImprinter';
import type { SpellContentReader } from '../../forge/SpellContentReader';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';
import type { CastLogPanelDeps } from '../tabs/CastLogPanel';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { GrimoireData, Effort } from '../../domain/settings/Settings';
import type { CastDispatcher } from '../../cast/CastDispatcher';
import type { PluginPaths } from '../../infra/PluginPaths';
import { refineCastSpell } from '../../refine/refineCastSpell';
import { resolveRefinePath } from '../../refine/resolveRefinePath';
import { isRefineSentinel } from '../../refine/refineSentinelScanner';
import { HOTKEY_FRONTMATTER_KEY } from '../../domain/spells/Hotkey';
import type { HotkeyEraser, HotkeyWriter } from '../components/HotkeyTypes';
import { readCastingFrontmatter } from '../../infra/castingFrontmatter';
import type { CastingFrontmatterReader, CastingFrontmatterWriter } from '../../infra/castingFrontmatter';
import { CASTING_FRONTMATTER_KEY } from '../../domain/settings/CastingSettings';
import type { ModelId } from '../../domain/settings/ModelId';
import { CLAUDE_CODE } from '../../domain/settings/Provider';
import type { Logger } from '../../infra/Logger';

export interface CommandPopupBuilderDeps {
  app: App;
  plugin: { data: GrimoireData; overrides: SpellOverrideStore };
  imprinter: ForgeImprinter;
  updateImprinter: ForgeUpdateImprinter;
  spellContentReader: SpellContentReader;
  sessionMap: OptionsSessionMap;
  castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
  createDispatcher: (close: () => void) => CastDispatcher;
  paths: PluginPaths;
  /** Reads casting settings from spell frontmatter or returns null if absent/invalid. */
  castingReader: CastingFrontmatterReader;
  /** Writes casting settings to spell frontmatter. */
  castingWriter: CastingFrontmatterWriter;
  /** Writes vault-wide default model/effort to plugin settings and schedules a save. */
  setVaultDefault: (model: ModelId, effort: Effort | null) => void;
  /** Optional logger injected from the host. */
  logger?: Logger;
}

export class CommandPopupBuilder {
  readonly #deps: CommandPopupBuilderDeps;

  constructor(deps: CommandPopupBuilderDeps) {
    this.#deps = deps;
  }

  build(): CommandPopup {
    let dispatcher: CastDispatcher;
    let popup: CommandPopup;
    popup = this.#createPopup(() => dispatcher, () => popup);
    dispatcher = this.#deps.createDispatcher(() => popup.close());
    return popup;
  }

  #createPopup(
    getDispatcher: () => CastDispatcher,
    getPopup: () => CommandPopup,
  ): CommandPopup {
    const refineCastAction = this.#buildRefineCastAction(getDispatcher, getPopup);
    const forgeUpdateAction = this.#buildForgeUpdateAction(getPopup);
    return new CommandPopup({
      app: this.#deps.app,
      spellTag: this.#deps.plugin.data.settings.spellTag,
      rankSpells: obsidianRanker,
      imprintAction: this.#buildImprintAction(getPopup),
      castAction: this.#buildCastAction(getDispatcher),
      refineCastAction,
      forgeUpdateAction,
      spellContentReader: this.#deps.spellContentReader,
      defaults: {
        defaultModel: this.#deps.plugin.data.settings.defaultModel,
        defaultEffort: this.#deps.plugin.data.settings.defaultEffort,
        defaultProvider: this.#deps.plugin.data.settings.defaultProvider,
      },
      overrides: this.#deps.plugin.overrides,
      sessionMap: this.#deps.sessionMap,
      castLogPanelDeps: this.#deps.castLogPanelDeps,
      settingsActiveRefinePath: this.#deps.plugin.data.settings.activeRefinePath,
      hotkeyEraser: this.#buildHotkeyEraser(),
      hotkeyWriter: this.#buildHotkeyWriter(),
      reader: (spellPath) => readCastingFrontmatter(this.#deps.app, spellPath),
      castingWriter: this.#buildCastingWriter(),
      setVaultDefault: this.#deps.setVaultDefault,
      logger: this.#deps.logger,
    });
  }

  #buildRefineCastAction(
    getDispatcher: () => CastDispatcher,
    getPopup: () => CommandPopup,
  ): RefineCastAction {
    return (snapshot) => {
      const activeFile = this.#deps.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension !== 'md') {
        new Notice('Refine needs an open note');
        return;
      }
      const resolved = this.#resolveRefinePath(snapshot.refinePathOverride);
      if (resolved.isFallback) {
        new Notice('Custom Refine spell not found — using default');
      }
      getDispatcher().dispatch({
        spell: refineCastSpell(),
        model: snapshot.model,
        effort: snapshot.effort,
        contextNotePaths: snapshot.contextNotePaths,
        followUp: snapshot.followUp,
        settings: this.#deps.plugin.data.settings,
        activeFilePath: activeFile.path,
        executeOnNote: true,
        systemPromptFilePath: resolved.path,
        provider: CLAUDE_CODE,
      });
      getPopup().dismiss();
    };
  }

  #resolveRefinePath(perCast: string | null | undefined) {
    const bundled = this.#deps.paths.refineSpellPathVaultRel();
    const { activeRefinePath } = this.#deps.plugin.data.settings;
    const isSentinel = (p: string): boolean => {
      const file = this.#deps.app.vault.getAbstractFileByPath(p);
      if (!(file instanceof TFile)) return false;
      return isRefineSentinel(this.#deps.app, file);
    };
    return resolveRefinePath({ perCast, settingsActive: activeRefinePath, bundledDefaultVaultRel: bundled, isSentinel });
  }

  #buildForgeUpdateAction(getPopup: () => CommandPopup): ForgeUpdateAction {
    return (_spell, snapshot) => {
      this.#deps.updateImprinter.imprint(snapshot, this.#deps.plugin.data.settings, () => getPopup().close());
    };
  }

  #buildImprintAction(getPopup: () => CommandPopup): ImprintAction {
    return (snapshot) => {
      this.#deps.imprinter.imprint(snapshot, this.#deps.plugin.data.settings, () => getPopup().close());
    };
  }

  #buildCastAction(getDispatcher: () => CastDispatcher): CastAction {
    return (spell, snap) => {
      getDispatcher().dispatch({
        spell,
        model: snap.model,
        effort: snap.effort,
        contextNotePaths: snap.contextNotePaths,
        followUp: snap.followUp,
        settings: this.#deps.plugin.data.settings,
        activeFilePath: this.#deps.app.workspace.getActiveFile()?.path ?? null,
        executeOnNote: snap.executeOnNote,
        provider: snap.provider,
      });
    };
  }

  #buildHotkeyEraser(): HotkeyEraser {
    return (spellPath) => {
      const file = this.#deps.app.vault.getAbstractFileByPath(spellPath);
      if (!(file instanceof TFile)) {
        return Promise.reject(new Error('spell file not found'));
      }
      return this.#deps.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        delete fm[HOTKEY_FRONTMATTER_KEY];
      });
    };
  }

  #buildHotkeyWriter(): HotkeyWriter {
    return (spellPath, hotkey) => {
      const file = this.#deps.app.vault.getAbstractFileByPath(spellPath);
      if (!(file instanceof TFile)) {
        return Promise.reject(new Error('spell file not found'));
      }
      return this.#deps.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm[HOTKEY_FRONTMATTER_KEY] = hotkey;
      });
    };
  }

  /** Builds a closure that upserts the grimoire-casting block in a spell's frontmatter. */
  #buildCastingWriter(): CastingFrontmatterWriter {
    return (spellPath, settings) => {
      const file = this.#deps.app.vault.getAbstractFileByPath(spellPath);
      if (!(file instanceof TFile)) {
        return Promise.reject(new Error('spell file not found'));
      }
      return this.#deps.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm[CASTING_FRONTMATTER_KEY] = settings;
      });
    };
  }

}
