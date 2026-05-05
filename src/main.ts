import { Plugin } from 'obsidian';
import { GrimoireData } from './domain/settings/Settings';
import { hydrate } from './domain/settings/persistence';
import { DebouncedSaver } from './infra/DebouncedSaver';
import { SpellOverrideStore } from './domain/settings/SpellOverrideStore';
import { GrimoireSettingTab } from './ui/settings/GrimoireSettingTab';
import { CommandPopup } from './ui/CommandPopup';

export default class GrimoirePlugin extends Plugin {
  data!: GrimoireData;
  saver!: DebouncedSaver;
  overrides!: SpellOverrideStore;

  async onload(): Promise<void> {
    this.data = hydrate(await this.loadData(), this.app);
    this.saver = new DebouncedSaver(() => this.saveData(this.data), 500);
    this.overrides = new SpellOverrideStore({ data: this.data, saver: this.saver });
    this.addSettingTab(new GrimoireSettingTab(this.app, this));
    this.addCommand({
      id: 'open-command-popup',
      name: 'Open Grimoire',
      callback: () => new CommandPopup(this.app).open(),
    });
  }

  onunload(): void {
    this.saver.flush();
  }

  save(): void { this.saver.schedule(); }
}
