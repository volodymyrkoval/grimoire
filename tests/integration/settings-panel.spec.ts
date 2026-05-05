import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { hydrate } from '../../src/domain/settings/persistence';
import { GrimoireSettingTab } from '../../src/ui/settings/GrimoireSettingTab';

vi.mock('../../src/domain/settings/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/vault'),
}));

function makePlugin() {
  const app = new App();
  return {
    app,
    data: hydrate(undefined, app),
    save: vi.fn(),
  } as any;
}

describe('GrimoireSettingTab seam', () => {
  let plugin: ReturnType<typeof makePlugin>;
  let tab: GrimoireSettingTab;

  beforeEach(() => {
    vi.restoreAllMocks();
    plugin = makePlugin();
    tab = new GrimoireSettingTab(plugin.app, plugin);
    tab.display();
  });

  // (i) Seven rows render — each Setting appends settingEl + controlEl → 14 children
  it('renders 7 setting rows (14 child elements in containerEl)', () => {
    expect(tab.containerEl.childElementCount).toBe(14);
  });

  // (ii) Text input write-through — spell-tag (index 0)
  it('typing in the spell-tag input writes through to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    const inputs = tab.containerEl.querySelectorAll('input');
    (inputs[0] as any).__triggerChange('#spell');

    expect(plugin.data.settings.spellTag).toBe('#spell');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (iii) Dropdown → Haiku — model field updated, save called
  it('selecting claude-haiku-4-5 writes defaultModel to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    const selects = tab.containerEl.querySelectorAll('select');
    (selects[0] as any).__triggerChange('claude-haiku-4-5');

    expect(plugin.data.settings.defaultModel).toBe('claude-haiku-4-5');
    expect(plugin.save).toHaveBeenCalled();
  });

  // (iv) Dropdown → Opus — effort row lazy-mounts with 5 buttons
  it('selecting claude-opus-4-5 after haiku renders 5 effort buttons', () => {
    const selects = tab.containerEl.querySelectorAll('select');
    // First go to Haiku (Case 2: segmented stays from Sonnet default)
    (selects[0] as any).__triggerChange('claude-haiku-4-5');
    // Then pick Opus — Case 1: setOptions → 5 Opus buttons
    (selects[0] as any).__triggerChange('claude-opus-4-5');

    const btns = tab.containerEl.querySelectorAll('.grimoire-segmented__btn');
    expect(btns.length).toBe(5);
  });

  // (v) Effort button click — write-through + save
  it('clicking an effort button writes defaultEffort and calls save', () => {
    const selects = tab.containerEl.querySelectorAll('select');
    (selects[0] as any).__triggerChange('claude-opus-4-5');
    plugin.save.mockClear();

    const btn = tab.containerEl.querySelector<HTMLButtonElement>('.grimoire-segmented__btn');
    expect(btn).not.toBeNull();
    btn!.click();

    expect(plugin.data.settings.defaultEffort).toBe('low');
    expect(plugin.save).toHaveBeenCalled();
  });
});
