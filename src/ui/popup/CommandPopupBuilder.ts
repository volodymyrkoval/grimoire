import { App, Notice, TFile } from 'obsidian';
import { CommandPopup } from '../CommandPopup';
import type { RefineCastAction, ForgeUpdateAction } from '../CommandPopup';
import { obsidianRanker } from '../../infra/obsidianRanker';
import type { ForgeImprinter } from '../../forge/ForgeImprinter';
import type { ForgeUpdateImprinter } from '../../forge/ForgeUpdateImprinter';
import type { SpellContentReader } from '../../forge/SpellContentReader';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';
import type { CastLogPanelDeps } from '../tabs/CastLogPanel';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { GrimoireData } from '../../domain/settings/Settings';
import type { CastDispatcher } from '../../cast/CastDispatcher';
import type { PluginPaths } from '../../infra/PluginPaths';
import { refineCastSpell } from '../../refine/refineCastSpell';
import { resolveRefinePath } from '../../refine/resolveRefinePath';
import { isRefineSentinel } from '../../refine/refineSentinelScanner';

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
}

export class CommandPopupBuilder {
  readonly #deps: CommandPopupBuilderDeps;

  constructor(deps: CommandPopupBuilderDeps) {
    this.#deps = deps;
  }

  build(): CommandPopup {
    let dispatcher: CastDispatcher;
    let popup: CommandPopup;

    const refineCastAction = this.#buildRefineCastAction(() => dispatcher, () => popup);
    const forgeUpdateAction: ForgeUpdateAction = (spell, snapshot) => {
      this.#deps.updateImprinter.imprint(snapshot, this.#deps.plugin.data.settings, () => popup.close());
    };
    popup = this.#createPopup(refineCastAction, forgeUpdateAction, () => dispatcher);
    dispatcher = this.#deps.createDispatcher(() => popup.close());

    return popup;
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

  #createPopup(
    refineCastAction: RefineCastAction,
    forgeUpdateAction: ForgeUpdateAction,
    getDispatcher: () => CastDispatcher,
  ): CommandPopup {
    const popup = new CommandPopup({
      app: this.#deps.app,
      spellTag: this.#deps.plugin.data.settings.spellTag,
      rankSpells: obsidianRanker,
      imprintAction: (snapshot) => {
        this.#deps.imprinter.imprint(snapshot, this.#deps.plugin.data.settings, () => popup.close());
      },
      castAction: (spell, snap) => {
        getDispatcher().dispatch({
          spell,
          model: snap.model,
          effort: snap.effort,
          contextNotePaths: snap.contextNotePaths,
          followUp: snap.followUp,
          settings: this.#deps.plugin.data.settings,
          activeFilePath: this.#deps.app.workspace.getActiveFile()?.path ?? null,
          executeOnNote: snap.executeOnNote,
        });
      },
      refineCastAction,
      forgeUpdateAction,
      spellContentReader: this.#deps.spellContentReader,
      defaults: {
        defaultModel: this.#deps.plugin.data.settings.defaultModel,
        defaultEffort: this.#deps.plugin.data.settings.defaultEffort,
      },
      overrides: this.#deps.plugin.overrides,
      sessionMap: this.#deps.sessionMap,
      castLogPanelDeps: this.#deps.castLogPanelDeps,
      settingsActiveRefinePath: this.#deps.plugin.data.settings.activeRefinePath,
    });
    return popup;
  }
}
