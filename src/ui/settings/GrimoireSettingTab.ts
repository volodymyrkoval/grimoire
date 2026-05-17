import { App, PluginSettingTab, Setting } from 'obsidian';
import { GrimoireData, SUPPORTED_MODELS } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';
import { modelId } from '../../domain/settings/ModelId';

/**
 * Plugin settings UI rendered in Obsidian's Settings modal.
 * Groups general settings (spell tag, CLI, binary path, vault mount) and advanced settings
 * (remote execution, portal config, auth) with reactive persistence via plugin.save().
 */
export class GrimoireSettingTab extends PluginSettingTab {
  readonly #plugin: { app: App; data: GrimoireData; save(): void };
  readonly #onSettingsSaved: () => void;

  constructor(app: App, plugin: { app: App; data: GrimoireData; save(): void }, onSettingsSaved?: () => void) {
    // plugin satisfies PluginSettingTab structurally; 'as any' bridges the nominal Obsidian Plugin type
    super(app, plugin as unknown as import('obsidian').Plugin);
    this.#plugin = plugin;
    this.#onSettingsSaved = onSettingsSaved ?? (() => {});
  }

  /** Saves plugin data and fires the onSettingsSaved callback (fire-and-forget). */
  #save(): void {
    this.#plugin.save();
    this.#onSettingsSaved();
  }

  display(): void {
    this.containerEl.empty();
    this.#renderGeneralSection();
    this.#renderAdvancedSection();
  }

  #renderGeneralSection(): void {
    const s = this.#plugin.data.settings;
    this.#addTextField('Spell tag',          () => s.spellTag,          v => { s.spellTag = v; });
    this.#addTextField('CLI command',        () => s.cliCommand,        v => { s.cliCommand = v; });
    this.#addTextField('Binary path',        () => s.binaryPath,        v => { s.binaryPath = v; });
    this.#addTextField('Forge output folder',() => s.forgeOutputFolder, v => { s.forgeOutputFolder = v; });
    this.#addTextField('Vault mount path',   () => s.vaultMountPath,    v => { s.vaultMountPath = v; });

    const effortRow = new EffortRow();
    this.#addModelField(effortRow);
    this.#addEffortField(effortRow);
  }

  #renderAdvancedSection(): void {
    new Setting(this.containerEl).setName('Advanced').setHeading();
    const s = this.#plugin.data.settings;
    this.#addToggleField(
      'Remote execution',
      () => this.#plugin.data.settings.executionMode === 'remote',
      v => { this.#plugin.data.settings.executionMode = v ? 'remote' : 'local'; },
      'Send spells to a portal server instead of running them locally.',
    );
    this.#addTextField('Portal host',      () => s.portalHost,         v => { s.portalHost = v; },
      'Hostname or full URL. Defaults to HTTPS unless http:// is prefixed.');
    this.#addTextField('Portal port',      () => s.portalPort,         v => { s.portalPort = v; });
    this.#addTextField('Portal path',      () => s.portalPath,         v => { s.portalPath = v; });
    this.#addTextField('Auth user',        () => s.portalAuthUser,     v => { s.portalAuthUser = v; });
    this.#addPasswordField('Auth password',() => s.portalAuthPassword, v => { s.portalAuthPassword = v; });
  }

  #addModelField(effortRow: EffortRow): void {
    const s = this.#plugin.data.settings;
    new Setting(this.containerEl).setName('Default model').addDropdown(d => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- addOption return is not a real Promise
      SUPPORTED_MODELS.forEach(m => d.addOption(m.id, m.label));
      d.setValue(s.defaultModel);
      d.onChange(rawModel => {
        s.defaultModel = modelId(rawModel);
        effortRow.update(s.defaultModel, s.defaultEffort);
        this.#save();
      });
    });
  }

  #addEffortField(effortRow: EffortRow): void {
    const s = this.#plugin.data.settings;
    const setting = new Setting(this.containerEl).setName('Default effort');
    effortRow.mount(setting.controlEl, {
      models: SUPPORTED_MODELS,
      modelId: s.defaultModel,
      effort: s.defaultEffort,
      onChange: effort => {
        s.defaultEffort = effort;
        this.#save();
      },
    });
  }

  #addTextField(label: string, getValue: () => string, setValue: (v: string) => void, desc?: string): void {
    const s = new Setting(this.containerEl).setName(label);
    if (desc) s.setDesc(desc);
    s.addText(t => t.setValue(getValue()).onChange(v => { setValue(v); this.#save(); }));
  }

  #addToggleField(label: string, get: () => boolean, set: (v: boolean) => void, desc?: string): void {
    const s = new Setting(this.containerEl).setName(label);
    if (desc) s.setDesc(desc);
    s.addToggle(t => t.setValue(get()).onChange(v => { set(v); this.#save(); }));
  }

  #addPasswordField(label: string, getValue: () => string, setValue: (v: string) => void): void {
    new Setting(this.containerEl)
      .setName(label)
      .addText(t => {
        t.setValue(getValue()).onChange(v => { setValue(v); this.#save(); });
        t.inputEl.type = 'password';
      });
  }
}
