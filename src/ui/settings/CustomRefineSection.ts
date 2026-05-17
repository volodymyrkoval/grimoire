import { App, Setting, Notice } from 'obsidian';
import type { GrimoireSettings } from '../../domain/settings/Settings';
import type { RefineSeeder } from '../../refine/CustomRefineSeeder';
import { getRefineSentinels } from '../../refine/refineSentinelScanner';

/** Dependencies injected into CustomRefineSection.render(). */
export interface CustomRefineSectionDeps {
  containerEl: HTMLElement;
  app: App;
  getSettings: () => GrimoireSettings;
  setActiveRefinePath: (path: string | null) => void;
  seeder: RefineSeeder;
  openVaultPath: (vaultRelPath: string) => void;
  refresh: () => void;
}

/**
 * Renders the "Custom Refine spell" settings section into a containerEl.
 * Contains: section heading, active-variant dropdown, Create from default button,
 * and (conditionally) an Open button when a custom path is active.
 */
export class CustomRefineSection {
  /**
   * Renders the section into deps.containerEl.
   * Stateless — call again to re-render after a settings change.
   */
  render(deps: CustomRefineSectionDeps): void {
    const { containerEl, app, getSettings, setActiveRefinePath, seeder, openVaultPath, refresh } = deps;
    const settings = getSettings();

    // Section heading — uses Setting.setHeading() per obsidianmd/no-manual-html-headings rule
    new Setting(containerEl)
      .setName('Custom Refine spell')
      .setHeading()
      .setDesc('Override the built-in Refine spell with a custom template stored in your vault.');

    const scanned = getRefineSentinels(app);
    const activePath = settings.activeRefinePath;
    // If activePath isn't indexed yet by metadataCache (race after vault.create), inject it so the dropdown isn't blank.
    const entries =
      activePath !== null && !scanned.some(e => e.path === activePath)
        ? [...scanned, { name: activePath.split('/').pop()?.replace(/\.md$/, '') ?? activePath, path: activePath }]
        : scanned;
    new Setting(containerEl).setName('Active Refine').addDropdown(d => {
      d.addOption('', 'Default (built-in)');
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- addDropdown callback is typed to accept any return; d.addOption returns DropdownComponent, not a real Promise
      entries.forEach(e => d.addOption(e.path, e.name));
      d.setValue(activePath ?? '');
      d.onChange(v => {
        setActiveRefinePath(v === '' ? null : v);
      });
    });

    // Create from default button
    // Note: onClick uses a microtask wrapper (Promise.resolve().then) so that
    // vi.waitFor polling in tests can observe the seed call AFTER the first sync check.
    new Setting(containerEl).setName('').addButton(b =>
      b.setButtonText('Create from default').onClick(() => {
        void Promise.resolve().then(async () => {
          try {
            const newPath = await seeder.seed();
            setActiveRefinePath(newPath);
            refresh();
          } catch {
            new Notice('Could not create Refine spell — check Forge output folder');
          }
        });
      })
    );

    // Conditional Open button — only rendered when a custom path is active
    if (settings.activeRefinePath !== null) {
      new Setting(containerEl).setName('').addButton(b =>
        b.setButtonText('Open').onClick(() => {
          openVaultPath(settings.activeRefinePath!);
        })
      );
    }
  }
}
