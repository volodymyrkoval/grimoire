import { App, Notice } from 'obsidian';
import { CommandPopup } from '../CommandPopup';
import type { RefineCastAction } from '../CommandPopup';
import type { ForgeImprinter } from '../../forge/ForgeImprinter';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';
import type { CastLogPanelDeps } from '../tabs/CastLogPanel';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { GrimoireData } from '../../domain/settings/Settings';
import type { CastDispatcher } from '../../cast/CastDispatcher';
import type { PluginPaths } from '../../infra/PluginPaths';
import { refineCastSpell } from '../../refine/refineCastSpell';

export interface CommandPopupBuilderDeps {
  app: App;
  plugin: { data: GrimoireData; overrides: SpellOverrideStore };
  imprinter: ForgeImprinter;
  sessionMap: OptionsSessionMap;
  castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
  createDispatcher: (close: () => void) => CastDispatcher;
  paths: PluginPaths;
}

/**
 * Factory for CommandPopup with dependency injection.
 * Wires up imprint and cast actions, bridging the popup to the plugin's core cast/forge engines.
 */
export class CommandPopupBuilder {
  readonly #deps: CommandPopupBuilderDeps;

  constructor(deps: CommandPopupBuilderDeps) {
    this.#deps = deps;
  }

  build(): CommandPopup {
    let dispatcher: CastDispatcher;

    const refineCastAction: RefineCastAction = (snapshot) => {
      const activeFile = this.#deps.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension !== 'md') {
        new Notice('Refine needs an open note');
        return;
      }
      dispatcher.dispatch({
        spell: refineCastSpell(),
        model: snapshot.model,
        effort: snapshot.effort,
        contextNotePaths: snapshot.contextNotePaths,
        followUp: snapshot.followUp,
        settings: this.#deps.plugin.data.settings,
        activeFilePath: activeFile.path,
        executeOnNote: true,           // Refine always targets active note; snapshot value ignored
        systemPromptFilePath: this.#deps.paths.refineSpellPathVaultRel(),
      });
      popup.dismiss();  // fully closes after dispatch; idempotent if dispatcher's close() already ran
    };

    const popup = new CommandPopup({
      app: this.#deps.app,
      spellTag: this.#deps.plugin.data.settings.spellTag,
      imprintAction: (snapshot) => {
        this.#deps.imprinter.imprint(snapshot, this.#deps.plugin.data.settings, () => popup.close());
      },
      castAction: (spell, snap) => {
        dispatcher.dispatch({
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
      defaults: {
        defaultModel: this.#deps.plugin.data.settings.defaultModel,
        defaultEffort: this.#deps.plugin.data.settings.defaultEffort,
      },
      overrides: this.#deps.plugin.overrides,
      sessionMap: this.#deps.sessionMap,
      castLogPanelDeps: this.#deps.castLogPanelDeps,
    });

    dispatcher = this.#deps.createDispatcher(() => popup.close());

    return popup;
  }
}
