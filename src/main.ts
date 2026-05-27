import { Plugin, TFile } from 'obsidian';
import { GrimoireData } from './domain/settings/Settings';
import { hydrate } from './infra/settingsPersistence';
import { DebouncedSaver } from './infra/DebouncedSaver';
import { PluginPaths } from './infra/PluginPaths';
import { SpellOverrideStore } from './domain/settings/SpellOverrideStore';
import { GrimoireSettingTab } from './ui/settings/GrimoireSettingTab';
import { CastLogModule } from './main/CastLogModule';
import { PopupModule } from './main/PopupModule';
import { refineMarkerExtension } from './editor/refineMarkerExtension';
import { CustomRefineSeeder } from './refine/CustomRefineSeeder';
import { renderRefineSystemPrompt } from './refine/refineTemplate';
import { readCastingFrontmatter } from './infra/castingFrontmatter';
import { CASTING_FRONTMATTER_KEY } from './domain/settings/CastingSettings';

/**
 * Obsidian plugin entry point for Grimoire (spell management and casting).
 * Lifecycle: onload (initializes data, cast log, and UI) → onunload (flushes pending saves).
 */
export default class GrimoirePlugin extends Plugin {
  data!: GrimoireData;
  saver!: DebouncedSaver;
  overrides!: SpellOverrideStore;

  /** Initializes plugin data, cast log, UI panels, and settings tab. */
  async onload(): Promise<void> {
    await this.#loadPluginData();
    const paths = this.#buildPaths();
    const castLog = await this.#initCastLog(paths);
    const popupModule = this.#buildPopupModule(castLog, paths);
    this.#registerUI(castLog, popupModule);
  }

  async #loadPluginData(): Promise<void> {
    await this.loadData().then((saved) => {
      this.data = hydrate(saved, this.app);
    });
    this.saver = new DebouncedSaver(() => this.saveData(this.data), 500);
    this.overrides = new SpellOverrideStore({ data: this.data, saver: this.saver });
  }

  #buildPaths(): PluginPaths {
    const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/grimoire`;
    return new PluginPaths(pluginDir);
  }

  async #initCastLog(paths: PluginPaths): Promise<CastLogModule> {
    const castLog = new CastLogModule({
      app: this.app,
      paths,
      getSettings: () => ({
        spellTag: this.data.settings.spellTag,
        forgeOutputFolder: this.data.settings.forgeOutputFolder,
        vaultMountPath: this.data.settings.vaultMountPath,
      }),
      getForgeUpdateSettings: () => ({ vaultMountPath: this.data.settings.vaultMountPath }),
    });
    await castLog.initStartupMaintenance();
    return castLog;
  }

  #buildPopupModule(castLog: CastLogModule, paths: PluginPaths): PopupModule {
    return new PopupModule({
      app: this.app,
      getData: () => this.data,
      overrides: this.overrides,
      castLog,
      getAgentHooksDirAbs: () => `${this.data.settings.vaultMountPath}/${paths.agentHooksDirAbs()}`,
      forgeSpellPaths: () => ({
        absForCaster: `${this.data.settings.vaultMountPath}/${paths.forgeSpellPathVaultRel()}`,
        vaultRelForPortal: paths.forgeSpellPathVaultRel(),
      }),
      forgeUpdateSpellPaths: () => ({
        absForCaster: `${this.data.settings.vaultMountPath}/${paths.forgeUpdateSpellPathVaultRel()}`,
        vaultRelForPortal: paths.forgeUpdateSpellPathVaultRel(),
      }),
      spellContentReader: {
        read: async (path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof TFile)) throw new Error(`Spell not found: ${path}`);
          return this.app.vault.cachedRead(file);
        },
      },
      paths,
      castingReader: (spellPath) => readCastingFrontmatter(this.app, spellPath),
      castingWriter: (spellPath, settings) => {
        const file = this.app.vault.getAbstractFileByPath(spellPath);
        if (!(file instanceof TFile)) throw new Error(`Spell file not found: ${spellPath}`);
        return this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          fm[CASTING_FRONTMATTER_KEY] = settings;
        });
      },
      setVaultDefault: (model, effort) => {
        this.data.settings.defaultModel = model;
        this.data.settings.defaultEffort = effort;
        this.saver.schedule();
      },
    });
  }

  #registerUI(castLog: CastLogModule, popupModule: PopupModule): void {
    const seeder = new CustomRefineSeeder({
      vault: this.app.vault,
      forgeOutputFolder: () => this.data.settings.forgeOutputFolder,
      renderBody: renderRefineSystemPrompt,
    });
    const openVaultPath = (p: string): void => void this.app.workspace.openLinkText(p, '', false);
    this.addSettingTab(new GrimoireSettingTab(this.app, this, () => {
      castLog.materializeForge().catch(console.error);
      castLog.materializeForgeUpdate().catch(console.error);
    }, seeder, openVaultPath));
    popupModule.register(this);
    try {
      this.registerEditorExtension(refineMarkerExtension());
    } catch (err) {
      console.error('refine-marker-styling: extension registration failed', err);
    }
  }

  /** Flushes any pending saves before shutdown. */
  onunload(): void {
    this.saver.flush();
  }

  /** Schedules a deferred save of the plugin data. */
  save(): void { this.saver.schedule(); }
}
