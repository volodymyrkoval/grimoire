import { App } from 'obsidian';
import { CommandPopup } from '../CommandPopup';
import type { ForgeImprinter } from '../../forge/ForgeImprinter';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';
import type { CastLogPanelDeps } from '../tabs/CastLogPanel';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { GrimoireData } from '../../domain/settings/Settings';
import type { CastDispatcher } from '../../cast/CastDispatcher';

export interface CommandPopupBuilderDeps {
  app: App;
  plugin: { data: GrimoireData; overrides: SpellOverrideStore };
  imprinter: ForgeImprinter;
  sessionMap: OptionsSessionMap;
  castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
  createDispatcher: (close: () => void) => CastDispatcher;
}

export class CommandPopupBuilder {
  readonly #deps: CommandPopupBuilderDeps;

  constructor(deps: CommandPopupBuilderDeps) {
    this.#deps = deps;
  }

  build(): CommandPopup {
    let dispatcher: CastDispatcher;
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
