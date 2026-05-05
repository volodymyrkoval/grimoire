import { App, PluginSettingTab, Setting } from 'obsidian';
import { GrimoireData, SUPPORTED_MODELS } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';

export class GrimoireSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: { app: App; data: GrimoireData; save(): void }) {
    // plugin satisfies PluginSettingTab structurally; 'as any' bridges the nominal Obsidian Plugin type
    super(app, plugin as any);
  }

  display(): void {
    this.containerEl.empty();

    const effortRow = new EffortRow();

    this.addTextField('Spell tag',          () => this.plugin.data.settings.spellTag,          v => { this.plugin.data.settings.spellTag = v; });
    this.addTextField('CLI command',        () => this.plugin.data.settings.cliCommand,        v => { this.plugin.data.settings.cliCommand = v; });
    this.addTextField('Binary path',        () => this.plugin.data.settings.binaryPath,        v => { this.plugin.data.settings.binaryPath = v; });
    this.addTextField('Forge output folder',() => this.plugin.data.settings.forgeOutputFolder, v => { this.plugin.data.settings.forgeOutputFolder = v; });
    this.addTextField('Vault mount path',   () => this.plugin.data.settings.vaultMountPath,    v => { this.plugin.data.settings.vaultMountPath = v; });

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

  private addTextField(label: string, getValue: () => string, setValue: (v: string) => void): void {
    new Setting(this.containerEl)
      .setName(label)
      .addText(t => t.setValue(getValue()).onChange(v => { setValue(v); this.plugin.save(); }));
  }
}
