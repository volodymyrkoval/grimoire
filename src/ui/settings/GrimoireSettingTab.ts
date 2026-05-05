import { App, PluginSettingTab, Setting } from 'obsidian';
import { GrimoireData, SUPPORTED_MODELS } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';

export class GrimoireSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: { app: App; data: GrimoireData; save(): void }) {
    super(app, plugin as any);
  }

  display(): void {
    this.containerEl.empty();

    const effortRow = new EffortRow();

    // Row 1 — spellTag
    new Setting(this.containerEl)
      .setName('Spell tag')
      .addText(t =>
        t
          .setValue(this.plugin.data.settings.spellTag)
          .onChange(v => {
            this.plugin.data.settings.spellTag = v;
            this.plugin.save();
          })
      );

    // Row 2 — cliCommand
    new Setting(this.containerEl)
      .setName('CLI command')
      .addText(t =>
        t
          .setValue(this.plugin.data.settings.cliCommand)
          .onChange(v => {
            this.plugin.data.settings.cliCommand = v;
            this.plugin.save();
          })
      );

    // Row 3 — binaryPath
    new Setting(this.containerEl)
      .setName('Binary path')
      .addText(t =>
        t
          .setValue(this.plugin.data.settings.binaryPath)
          .onChange(v => {
            this.plugin.data.settings.binaryPath = v;
            this.plugin.save();
          })
      );

    // Row 4 — forgeOutputFolder
    new Setting(this.containerEl)
      .setName('Forge output folder')
      .addText(t =>
        t
          .setValue(this.plugin.data.settings.forgeOutputFolder)
          .onChange(v => {
            this.plugin.data.settings.forgeOutputFolder = v;
            this.plugin.save();
          })
      );

    // Row 5 — vaultMountPath
    new Setting(this.containerEl)
      .setName('Vault mount path')
      .addText(t =>
        t
          .setValue(this.plugin.data.settings.vaultMountPath)
          .onChange(v => {
            this.plugin.data.settings.vaultMountPath = v;
            this.plugin.save();
          })
      );

    // Row 6 — defaultModel (dropdown)
    const modelSetting = new Setting(this.containerEl).setName('Default model');
    modelSetting.addDropdown(d => {
      SUPPORTED_MODELS.forEach(m => d.addOption(m.id, m.label));
      d.setValue(this.plugin.data.settings.defaultModel);
      d.onChange(modelId => {
        this.plugin.data.settings.defaultModel = modelId;
        effortRow.update(modelId, this.plugin.data.settings.defaultEffort);
        this.plugin.save();
      });
    });

    // Row 7 — defaultEffort (EffortRow)
    const effortSetting = new Setting(this.containerEl).setName('Default effort');
    effortRow.mount(effortSetting.controlEl, {
      models: SUPPORTED_MODELS,
      modelId: this.plugin.data.settings.defaultModel,
      effort: this.plugin.data.settings.defaultEffort,
      onChange: effort => {
        this.plugin.data.settings.defaultEffort = effort;
        this.plugin.save();
      },
    });
  }
}
