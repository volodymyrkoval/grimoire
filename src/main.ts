import { Plugin, Notice } from 'obsidian';
import { GrimoireData } from './domain/settings/Settings';
import { hydrate } from './domain/settings/persistence';
import { DebouncedSaver } from './infra/DebouncedSaver';
import { SpellOverrideStore } from './domain/settings/SpellOverrideStore';
import { GrimoireSettingTab } from './ui/settings/GrimoireSettingTab';
import { CommandPopup } from './ui/CommandPopup';
import { ForgeImprinter } from './forge/ForgeImprinter';
import { CastRunner } from './cast/CastRunner';
import { CastDispatcher } from './cast/CastDispatcher';

export default class GrimoirePlugin extends Plugin {
  data!: GrimoireData;
  saver!: DebouncedSaver;
  overrides!: SpellOverrideStore;

  async onload(): Promise<void> {
    this.data = hydrate(await this.loadData(), this.app);
    this.saver = new DebouncedSaver(() => this.saveData(this.data), 500);
    this.overrides = new SpellOverrideStore({ data: this.data, saver: this.saver });
    this.addSettingTab(new GrimoireSettingTab(this.app, this));
    const imprinter = new ForgeImprinter({
      notify: (msg) => { new Notice(msg); },
      castRunner: new CastRunner(),
    });
    this.addCommand({
      id: 'open-command-popup',
      name: 'Open Grimoire',
      callback: () => {
        // close is captured by reference — popup and dispatcher are assigned before either close can fire.
        const closeRef = { close: () => {} };
        const dispatcher = new CastDispatcher({
          notify: (msg) => { new Notice(msg); },
          close: () => closeRef.close(),
          castRunner: new CastRunner(),
        });
        const popup = new CommandPopup(
          this.app,
          this.data.settings.spellTag,
          (snapshot) => imprinter.imprint(snapshot, this.data.settings, () => closeRef.close()),
          (spell) => dispatcher.dispatch({
            spell,
            model: this.data.settings.defaultModel,
            effort: this.data.settings.defaultEffort,
            contextNotePaths: [],
            followUp: '',
            settings: this.data.settings,
            activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
          }),
          { defaultModel: this.data.settings.defaultModel, defaultEffort: this.data.settings.defaultEffort },
        );
        closeRef.close = () => popup.close();
        popup.open();
      },
    });
  }

  onunload(): void {
    this.saver.flush();
  }

  save(): void { this.saver.schedule(); }
}
