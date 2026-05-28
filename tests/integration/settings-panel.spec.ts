import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { hydrate } from '../../src/infra/settingsPersistence';
import { GrimoireSettingTab } from '../../src/ui/settings/GrimoireSettingTab';

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

describe('GrimoireSettingTab seam', () => {
  let plugin: ReturnType<typeof makePlugin>;
  let tab: GrimoireSettingTab;

  beforeEach(() => {
    vi.restoreAllMocks();
    plugin = makePlugin();
    tab = new GrimoireSettingTab(plugin.app, plugin);
    tab.display();
  });

  // (i) 16 rows (9 general [6 text (spellTag, cliCommand, binaryPath, mcpConfigPath, forgeOutputFolder, vaultMountPath) + 1 provider dropdown + 1 model dropdown + 1 effort row]
  //             + 5 Advanced text/password + 2 toggles [executionMode, showCastOutput])
  //   + 2 Custom Refine rows (heading×3 + dropdown×2 = 5 elements)
  //   + Advanced heading (3 elements) + Debug heading (3 elements)
  //   = 18 general + 5 customRefine + 3 advancedHeading + 12 advancedRows + 3 debugHeading + 2 debugToggle = 43 children
  it('renders setting rows + section headings (43 child elements in containerEl)', () => {
    expect(tab.containerEl.childElementCount).toBe(43);
  });

  // (ii) Text input write-through — spell-tag (index 0)
  it('typing in the spell-tag input writes through to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    (textInputs[0] as any).__triggerChange('#spell');

    expect(plugin.data.settings.spellTag).toBe('#spell');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (ii-b) Text input write-through — mcp config path (index 3)
  it('typing in the MCP config path input writes through to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    (textInputs[3] as any).__triggerChange('/abs/path/mcp.json');

    expect(plugin.data.settings.mcpConfigPath).toBe('/abs/path/mcp.json');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (iii) Dropdown → Haiku — model field updated, save called
  // Provider dropdown is now at index 0, model dropdown is at index 1
  it('selecting claude-haiku-4-5 writes defaultModel to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    const selects = tab.containerEl.querySelectorAll('select');
    (selects[1] as any).__triggerChange('claude-haiku-4-5');

    expect(plugin.data.settings.defaultModel).toBe('claude-haiku-4-5');
    expect(plugin.save).toHaveBeenCalled();
  });

  // (iv) Dropdown → Opus — effort row lazy-mounts with 5 buttons
  // Provider dropdown is now at index 0, model dropdown is at index 1
  it('selecting claude-opus-4-5 after haiku renders 5 effort buttons', () => {
    const selects = tab.containerEl.querySelectorAll('select');
    // First go to Haiku (Case 2: segmented stays from Sonnet default)
    (selects[1] as any).__triggerChange('claude-haiku-4-5');
    // Then pick Opus — Case 1: setOptions → 5 Opus buttons
    (selects[1] as any).__triggerChange('claude-opus-4-5');

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

  // (vi) Toggle write-through — executionMode
  it('toggling execution mode to true writes executionMode="remote" and calls save', () => {
    plugin.save.mockClear();
    const checkboxes = tab.containerEl.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    (checkboxes[0] as any).__triggerChange(true);
    expect(plugin.data.settings.executionMode).toBe('remote');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('toggling execution mode to false writes executionMode="local" and calls save', () => {
    plugin.save.mockClear();
    const checkboxes = tab.containerEl.querySelectorAll('input[type="checkbox"]');
    (checkboxes[0] as any).__triggerChange(false);
    expect(plugin.data.settings.executionMode).toBe('local');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (vi-b) Show cast output in console toggle — B0 red tests
  it('Advanced section contains a toggle with label "Show cast output in console"', () => {
    const containerText = tab.containerEl.textContent ?? '';
    expect(containerText).toContain('Show cast output in console');
  });

  it('Advanced section contains the showCastOutput toggle description text', () => {
    const containerText = tab.containerEl.textContent ?? '';
    expect(containerText).toContain(
      'Stream local cast stdout/stderr to the developer console as it arrives, prefixed with the cast id. Desktop only; ignored for remote casts.',
    );
  });

  it('there are 2 checkboxes (executionMode + showCastOutput) after B1 is implemented', () => {
    const checkboxes = tab.containerEl.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
  });

  it('toggling showCastOutput to true writes showCastOutput=true and calls save exactly once', () => {
    plugin.save.mockClear();
    const checkboxes = tab.containerEl.querySelectorAll('input[type="checkbox"]');
    (checkboxes[1] as any).__triggerChange(true);
    expect(plugin.data.settings.showCastOutput).toBe(true);
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('toggling showCastOutput back to false writes showCastOutput=false and calls save exactly once', () => {
    plugin.save.mockClear();
    const checkboxes = tab.containerEl.querySelectorAll('input[type="checkbox"]');
    (checkboxes[1] as any).__triggerChange(false);
    expect(plugin.data.settings.showCastOutput).toBe(false);
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (vii) Password input type
  it('password row input element has type="password"', () => {
    const passwordInputs = tab.containerEl.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(1);
  });

  it('typing in the password input writes portalAuthPassword and calls save', () => {
    plugin.save.mockClear();
    const passwordInput = tab.containerEl.querySelector('input[type="password"]');
    expect(passwordInput).not.toBeNull();
    (passwordInput as any).__triggerChange('secret123');
    expect(plugin.data.settings.portalAuthPassword).toBe('secret123');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (viii) Advanced field write-through
  it('typing in portalHost input writes through to settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    // portalHost is the first Advanced text row — after 6 general text rows (spellTag, cliCommand, binaryPath, mcpConfigPath, forgeOutputFolder, vaultMountPath)
    const hostInput = textInputs[6];
    expect(hostInput).toBeDefined();
    (hostInput as any).__triggerChange('portal.example.com');
    expect(plugin.data.settings.portalHost).toBe('portal.example.com');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('typing in portalPort input writes through to settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    const portInput = textInputs[7];
    expect(portInput).toBeDefined();
    (portInput as any).__triggerChange('8080');
    expect(plugin.data.settings.portalPort).toBe('8080');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('typing in portalPath input writes through to settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    const pathInput = textInputs[8];
    expect(pathInput).toBeDefined();
    (pathInput as any).__triggerChange('/api/grimoire');
    expect(plugin.data.settings.portalPath).toBe('/api/grimoire');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('typing in portalAuthUser input writes through to settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    const authUserInput = textInputs[9];
    expect(authUserInput).toBeDefined();
    (authUserInput as any).__triggerChange('grimoire_user');
    expect(plugin.data.settings.portalAuthUser).toBe('grimoire_user');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (ix) DOM order — Advanced section appears after 7th existing Setting, after <hr> and <h3>
  it('containerEl has an <hr> element separating existing rows from Advanced section', () => {
    const hr = tab.containerEl.querySelector('hr');
    expect(hr).not.toBeNull();
  });

  it('containerEl has an <h3> element with text "Advanced" in the Advanced section', () => {
    const h3s = Array.from(tab.containerEl.querySelectorAll('h3'));
    const advancedH3 = h3s.find(h => h.textContent === 'Advanced');
    expect(advancedH3).not.toBeUndefined();
    expect(advancedH3!.textContent).toBe('Advanced');
  });

  it('<hr> and <h3> appear after the 9 general Setting children (6 text + provider + model + effort) and before the Advanced rows', () => {
    const children = Array.from(tab.containerEl.children);
    // 9 general: indices 0-17; hr: 18; h3: 19
    const hrIndex = children.findIndex(c => c.tagName === 'HR');
    const h3Index = children.findIndex(c => c.tagName === 'H3');
    // hr comes after 9 general settings (18 children) = after index 17
    expect(hrIndex).toBe(18);
    expect(h3Index).toBe(19);
  });

  it('Portal host row has description text', () => {
    const containerText = tab.containerEl.textContent ?? '';
    expect(containerText).toContain('Hostname or full URL. Defaults to HTTPS unless http:// is prefixed.');
  });

  it('editing a text field triggers the onSettingsSaved callback after each save', () => {
    const onSettingsSaved = vi.fn();
    const tabWithCallback = new GrimoireSettingTab(plugin.app, plugin, onSettingsSaved);
    tabWithCallback.display();

    onSettingsSaved.mockClear();
    const textInputs = tabWithCallback.containerEl.querySelectorAll('input[type="text"]');
    (textInputs[0] as any).__triggerChange('#newTag');

    expect(onSettingsSaved).toHaveBeenCalledTimes(1);
  });
});
