import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { hydrate } from '../../src/infra/settingsPersistence';
import { GrimoireSettingTab } from '../../src/ui/settings/GrimoireSettingTab';
import { KNOWN_PROVIDERS, CLAUDE_CODE } from '../../src/domain/settings/Provider';

vi.mock('../../src/infra/computeVaultMountDefault', () => ({
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

describe('GrimoireSettingTab — Default provider dropdown seam', () => {
  let plugin: ReturnType<typeof makePlugin>;
  let tab: GrimoireSettingTab;

  beforeEach(() => {
    vi.restoreAllMocks();
    plugin = makePlugin();
    tab = new GrimoireSettingTab(plugin.app, plugin);
    tab.display();
  });

  // (i) A "Default provider" dropdown must exist in the rendered settings UI
  it('renders a "Default provider" dropdown in the settings panel', () => {
    const selects = tab.containerEl.querySelectorAll('select');
    // The provider dropdown must be present alongside the existing model dropdown.
    // Before G7 adds #addProviderField, only the model dropdown exists — this fails.
    expect(selects.length).toBeGreaterThanOrEqual(2);

    // Confirm that at least one <select> is preceded by a setting row whose text
    // includes "Default provider".
    const containerText = tab.containerEl.textContent ?? '';
    expect(containerText).toContain('Default provider');
  });

  // (ii) The dropdown options must be exactly KNOWN_PROVIDERS
  it('dropdown options match exactly KNOWN_PROVIDERS', () => {
    const selects = Array.from(tab.containerEl.querySelectorAll('select')) as HTMLSelectElement[];
    // The provider dropdown is rendered before the model dropdown (#addProviderField
    // is called before #addModelField in #renderGeneralSection).
    // Before G7 implements #addProviderField this index does not exist — test fails.
    const providerSelect = selects[0];
    expect(providerSelect).toBeDefined();

    const optionValues = Array.from(providerSelect.options).map(o => o.value);
    expect(optionValues).toEqual([...KNOWN_PROVIDERS]);
  });

  // (iii) The dropdown's selected value must reflect settings.defaultProvider
  it('dropdown value reflects settings.defaultProvider', () => {
    const selects = Array.from(tab.containerEl.querySelectorAll('select')) as HTMLSelectElement[];
    // Provider dropdown comes first (rendered before model dropdown).
    const providerSelect = selects[0];
    expect(providerSelect).toBeDefined();
    expect(providerSelect.value).toBe(plugin.data.settings.defaultProvider);
  });

  // (iv) Changing the dropdown must write a known Provider back to settings and fire save
  it('onChange writes a known Provider to settings.defaultProvider and fires save', () => {
    plugin.save.mockClear();

    // Find the provider dropdown by looking for a <select> that has 'claude-code' as an option value.
    // Before G7 adds #addProviderField, no such select exists — the assertion below fails RED.
    const allSelects = Array.from(tab.containerEl.querySelectorAll('select')) as HTMLSelectElement[];
    const providerSelect = allSelects.find(s =>
      Array.from(s.options).some(o => o.value === CLAUDE_CODE),
    ) as HTMLSelectElement & { __triggerChange: (v: string) => void } | undefined;

    expect(providerSelect).toBeDefined();

    // Simulate selecting the only available option — CLAUDE_CODE ('claude-code')
    providerSelect!.__triggerChange(CLAUDE_CODE);

    // Must be a known Provider (branded — equals CLAUDE_CODE string value)
    expect(plugin.data.settings.defaultProvider).toBe(CLAUDE_CODE);
    // Must not be null or an unknown bare string
    expect(KNOWN_PROVIDERS).toContain(plugin.data.settings.defaultProvider);
    // Save callback must have fired
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });
});
