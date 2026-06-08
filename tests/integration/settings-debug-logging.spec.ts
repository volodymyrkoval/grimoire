import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { hydrate } from '../../src/infra/settingsPersistence';
import { GrimoireSettingTab } from '../../src/ui/settings/GrimoireSettingTab';
import { PortalSecret } from '../../src/infra/PortalSecret';

vi.mock('../../src/infra/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/vault'),
}));

function makePlugin() {
  const app = new App();
  const secret = new PortalSecret({ secretStorage: app.secretStorage });
  return {
    app,
    secret,
    data: hydrate(undefined, app),
    save: vi.fn(),
  } as any;
}

/**
 * Finds the controlEl div immediately following a settingEl div whose textContent
 * starts with the given label. Returns null when no such pair exists.
 *
 * The Setting mock appends settingEl (text = label) then controlEl as sibling children
 * of containerEl. This helper mirrors that structure.
 */
function findControlElByLabel(containerEl: HTMLElement, label: string): Element | null {
  const children = Array.from(containerEl.children);
  for (let i = 0; i < children.length - 1; i++) {
    const child = children[i];
    if (child.textContent?.startsWith(label)) {
      return children[i + 1];
    }
  }
  return null;
}

describe('GrimoireSettingTab — Debug-logging toggle seam', () => {
  let plugin: ReturnType<typeof makePlugin>;
  let tab: GrimoireSettingTab;

  beforeEach(() => {
    vi.restoreAllMocks();
    plugin = makePlugin();
    tab = new GrimoireSettingTab(plugin.app, plugin, plugin.secret);
    tab.display();
  });

  // (i) A "Debug logging" toggle must appear in the rendered Debug section.
  // Fails RED because #renderDebugSection() only adds "Show cast output in console" — no "Debug logging" row yet.
  it('renders a "Debug logging" toggle row in the Debug section', () => {
    const containerText = tab.containerEl.textContent ?? '';
    expect(containerText).toContain('Debug logging');

    const controlEl = findControlElByLabel(tab.containerEl, 'Debug logging');
    expect(controlEl).not.toBeNull();

    const toggle = controlEl!.querySelector('input[type="checkbox"]');
    expect(toggle).not.toBeNull();
  });

  // (ii) The toggle's initial checked state must reflect settings.debugLogging (false by default).
  // Fails RED because the toggle row does not exist yet.
  it('toggle initial state reflects settings.debugLogging (false by default)', () => {
    expect(plugin.data.settings.debugLogging).toBe(false);

    const controlEl = findControlElByLabel(tab.containerEl, 'Debug logging');
    expect(controlEl).not.toBeNull();

    const toggle = controlEl!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);
  });

  // (iii) Triggering onChange to true must set settings.debugLogging === true and fire plugin.save exactly once.
  // Fails RED because the toggle row does not exist yet.
  it('onChange sets settings.debugLogging and fires plugin.save exactly once', () => {
    plugin.save.mockClear();

    const controlEl = findControlElByLabel(tab.containerEl, 'Debug logging');
    expect(controlEl).not.toBeNull();

    const toggle = controlEl!.querySelector('input[type="checkbox"]') as HTMLInputElement & {
      __triggerChange: (v: boolean) => void;
    };
    expect(toggle).not.toBeNull();

    toggle.__triggerChange(true);

    expect(plugin.data.settings.debugLogging).toBe(true);
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });
});
