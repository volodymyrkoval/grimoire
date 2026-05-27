import { App, PluginSettingTab, Setting } from 'obsidian';
import { GrimoireData, SUPPORTED_MODELS } from '../../domain/settings/Settings';
import { EffortRow } from '../widgets/EffortRow';
import { modelId } from '../../domain/settings/ModelId';
import { KNOWN_PROVIDERS, CLAUDE_CODE, parseProvider } from '../../domain/settings/Provider';
import { RefineSeeder } from '../../refine/CustomRefineSeeder';
import { CustomRefineSection } from './CustomRefineSection';

/**
 * Plugin settings UI rendered in Obsidian's Settings modal.
 * Groups general settings (spell tag, CLI, binary path, vault mount), the Custom Refine
 * spell section, and advanced settings (remote execution, portal config, auth) with
 * reactive persistence via plugin.save().
 */
export class GrimoireSettingTab extends PluginSettingTab {
  readonly #plugin: { app: App; data: GrimoireData; save(): void };
  readonly #onSettingsSaved: () => void;
  readonly #seeder: RefineSeeder;
  readonly #openVaultPath: (path: string) => void;

  constructor(
    app: App,
    plugin: { app: App; data: GrimoireData; save(): void },
    onSettingsSaved?: () => void,
    seeder?: RefineSeeder,
    openVaultPath?: (path: string) => void,
  ) {
    // plugin satisfies PluginSettingTab structurally; 'as any' bridges the nominal Obsidian Plugin type
    super(app, plugin as unknown as import('obsidian').Plugin);
    this.#plugin = plugin;
    this.#onSettingsSaved = onSettingsSaved ?? (() => {});
    this.#seeder = seeder ?? this.#makeNoopSeeder();
    this.#openVaultPath = openVaultPath ?? (() => {});
  }

  /** Saves plugin data and fires the onSettingsSaved callback (fire-and-forget). */
  #save(): void {
    this.#plugin.save();
    this.#onSettingsSaved();
  }

  display(): void {
    this.containerEl.empty();
    this.#renderGeneralSection();
    this.#renderCustomRefineSection();
    this.#renderAdvancedSection();
  }

  #renderGeneralSection(): void {
    const s = this.#plugin.data.settings;
    this.#addTextField('Spell tag',          () => s.spellTag,          v => { s.spellTag = v; },
      'Frontmatter key used to mark notes as spells (e.g. spell).');
    this.#addTextField('CLI command',        () => s.cliCommand,        v => { s.cliCommand = v; },
      'Command used to invoke the agentic coding tool (e.g. claude).');
    this.#addTextField('Binary path',        () => s.binaryPath,        v => { s.binaryPath = v; },
      'Absolute path to the agentic tool binary. Leave blank to use the system PATH.');
    this.#addTextField('Forge output folder',() => s.forgeOutputFolder, v => { s.forgeOutputFolder = v; },
      'Vault folder where newly forged spell files are created.');
    this.#addTextField('Vault mount path',   () => s.vaultMountPath,    v => { s.vaultMountPath = v; },
      'Absolute path where the vault is mounted on disk. Used to resolve file paths during casting.');

    this.#addProviderField();
    const effortRow = new EffortRow();
    this.#addModelField(effortRow);
    this.#addEffortField(effortRow);
  }

  #renderCustomRefineSection(): void {
    const section = new CustomRefineSection();
    section.render({
      containerEl: this.containerEl,
      app: this.#plugin.app,
      getSettings: () => this.#plugin.data.settings,
      setActiveRefinePath: (path) => {
        this.#plugin.data.settings.activeRefinePath = path;
        this.#save();
      },
      seeder: this.#seeder,
      openVaultPath: this.#openVaultPath,
      refresh: () => {
        const scrollTop = this.containerEl.scrollTop;
        this.display();
        this.containerEl.scrollTop = scrollTop;
      },
    });
  }

  #makeNoopSeeder(): RefineSeeder {
    // Returns a RefineSeeder-shaped object that rejects immediately — safe fallback when no seeder is wired in
    return {
      seed: () => Promise.reject(new Error('No seeder configured')),
    };
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
    this.#addTextField('Portal port',      () => s.portalPort,         v => { s.portalPort = v; },
      'Port the portal server listens on (e.g. 3000).');
    this.#addTextField('Portal path',      () => s.portalPath,         v => { s.portalPath = v; },
      'URL path prefix for the portal API (e.g. /api).');
    this.#addTextField('Auth user',        () => s.portalAuthUser,     v => { s.portalAuthUser = v; },
      'Username for portal HTTP basic authentication.');
    this.#addPasswordField('Auth password',() => s.portalAuthPassword, v => { s.portalAuthPassword = v; },
      'Password for portal HTTP basic authentication.');
  }

  #addProviderField(): void {
    const s = this.#plugin.data.settings;
    new Setting(this.containerEl)
      .setName('Default provider')
      .setDesc('API provider used when casting spells unless overridden per-cast.')
      .addDropdown(d => {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- addOption return is not a real Promise
        KNOWN_PROVIDERS.forEach(p => d.addOption(p, p));
        d.setValue(s.defaultProvider);
        d.onChange(raw => {
          s.defaultProvider = parseProvider(raw) ?? CLAUDE_CODE;
          this.#save();
        });
      });
  }

  #addModelField(effortRow: EffortRow): void {
    const s = this.#plugin.data.settings;
    new Setting(this.containerEl).setName('Default model')
      .setDesc('AI model used when casting spells unless overridden per-cast.')
      .addDropdown(d => {
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
    const setting = new Setting(this.containerEl).setName('Default effort')
      .setDesc('Thinking budget for the default model. Higher effort produces better results but takes longer.');
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

  #addPasswordField(label: string, getValue: () => string, setValue: (v: string) => void, desc?: string): void {
    const s = new Setting(this.containerEl).setName(label);
    if (desc) s.setDesc(desc);
    s.addText(t => {
        t.setValue(getValue()).onChange(v => { setValue(v); this.#save(); });
        t.inputEl.type = 'password';
      });
  }

}
