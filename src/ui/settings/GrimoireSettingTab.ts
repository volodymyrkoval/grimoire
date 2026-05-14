import { App, PluginSettingTab, Setting } from 'obsidian';
import { GrimoireData, SUPPORTED_MODELS } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';

export class GrimoireSettingTab extends PluginSettingTab {
  readonly #plugin: { app: App; data: GrimoireData; save(): void };

  constructor(app: App, plugin: { app: App; data: GrimoireData; save(): void }) {
    // plugin satisfies PluginSettingTab structurally; 'as any' bridges the nominal Obsidian Plugin type
    super(app, plugin as unknown as import('obsidian').Plugin);
    this.#plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    const effortRow = new EffortRow();

    this.#addTextField('Spell tag',          () => this.#plugin.data.settings.spellTag,          v => { this.#plugin.data.settings.spellTag = v; });
    this.#addTextField('CLI command',        () => this.#plugin.data.settings.cliCommand,        v => { this.#plugin.data.settings.cliCommand = v; });
    this.#addTextField('Binary path',        () => this.#plugin.data.settings.binaryPath,        v => { this.#plugin.data.settings.binaryPath = v; });
    this.#addTextField('Forge output folder',() => this.#plugin.data.settings.forgeOutputFolder, v => { this.#plugin.data.settings.forgeOutputFolder = v; });
    this.#addTextField('Vault mount path',   () => this.#plugin.data.settings.vaultMountPath,    v => { this.#plugin.data.settings.vaultMountPath = v; });

    // Row 6 — defaultModel (dropdown)
    const modelSetting = new Setting(this.containerEl).setName('Default model');
    modelSetting.addDropdown(d => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- addOption return is not a real Promise
      SUPPORTED_MODELS.forEach(m => d.addOption(m.id, m.label));
      d.setValue(this.#plugin.data.settings.defaultModel);
      d.onChange(modelId => {
        this.#plugin.data.settings.defaultModel = modelId;
        effortRow.update(modelId, this.#plugin.data.settings.defaultEffort);
        this.#plugin.save();
      });
    });

    // Row 7 — defaultEffort (EffortRow)
    const effortSetting = new Setting(this.containerEl).setName('Default effort');
    effortRow.mount(effortSetting.controlEl, {
      models: SUPPORTED_MODELS,
      modelId: this.#plugin.data.settings.defaultModel,
      effort: this.#plugin.data.settings.defaultEffort,
      onChange: effort => {
        this.#plugin.data.settings.defaultEffort = effort;
        this.#plugin.save();
      },
    });

    this.#renderAdvancedSection();
  }

  #addToggleField(label: string, get: () => boolean, set: (v: boolean) => void, desc?: string): void {
    const s = new Setting(this.containerEl).setName(label);
    if (desc) s.setDesc(desc);
    s.addToggle(t => t.setValue(get()).onChange(v => { set(v); this.#plugin.save(); }));
  }

  #addPasswordField(label: string, getValue: () => string, setValue: (v: string) => void): void {
    new Setting(this.containerEl)
      .setName(label)
      .addText(t => {
        t.setValue(getValue()).onChange(v => { setValue(v); this.#plugin.save(); });
        t.inputEl.type = 'password';
      });
  }

  #renderAdvancedSection(): void {
    this.containerEl.createEl('hr');
    // eslint-disable-next-line obsidianmd/settings-tab/no-manual-html-headings
    this.containerEl.createEl('h3', { text: 'Advanced' });
    const s = this.#plugin.data.settings;
    this.#addToggleField(
      'Remote execution',
      () => this.#plugin.data.settings.executionMode === 'remote',
      v => { this.#plugin.data.settings.executionMode = v ? 'remote' : 'local'; },
      'Send spells to a portal server instead of running them locally.',
    );
    this.#addTextField('Portal host',      () => s.portalHost,         v => { s.portalHost = v; });
    this.#addTextField('Portal port',      () => s.portalPort,         v => { s.portalPort = v; });
    this.#addTextField('Portal path',      () => s.portalPath,         v => { s.portalPath = v; });
    this.#addTextField('Auth user',        () => s.portalAuthUser,     v => { s.portalAuthUser = v; });
    this.#addPasswordField('Auth password',() => s.portalAuthPassword, v => { s.portalAuthPassword = v; });
  }

  #addTextField(label: string, getValue: () => string, setValue: (v: string) => void): void {
    new Setting(this.containerEl)
      .setName(label)
      .addText(t => t.setValue(getValue()).onChange(v => { setValue(v); this.#plugin.save(); }));
  }
}
