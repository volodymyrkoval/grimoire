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

  // (i) 13 rows (7 existing + 5 Advanced text/password + 1 toggle) + 1 <hr> + 1 <h3> = 28 children
  it('renders 13 setting rows + hr + h3 (28 child elements in containerEl)', () => {
    expect(tab.containerEl.childElementCount).toBe(28);
  });

  // (ii) Text input write-through — spell-tag (index 0)
  it('typing in the spell-tag input writes through to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    (textInputs[0] as any).__triggerChange('#spell');

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
    // Advanced inputs are text inputs after the 5 original text inputs (spellTag, cliCommand, binaryPath, forgeOutput, vaultMount) = indices 5, 6, 7, 8 for host, port, path, authUser
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    // portalHost is the first Advanced text row — after 5 original text rows
    const hostInput = textInputs[5];
    expect(hostInput).toBeDefined();
    (hostInput as any).__triggerChange('portal.example.com');
    expect(plugin.data.settings.portalHost).toBe('portal.example.com');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('typing in portalPort input writes through to settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    const portInput = textInputs[6];
    expect(portInput).toBeDefined();
    (portInput as any).__triggerChange('8080');
    expect(plugin.data.settings.portalPort).toBe('8080');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('typing in portalPath input writes through to settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    const pathInput = textInputs[7];
    expect(pathInput).toBeDefined();
    (pathInput as any).__triggerChange('/api/grimoire');
    expect(plugin.data.settings.portalPath).toBe('/api/grimoire');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  it('typing in portalAuthUser input writes through to settings and calls save', () => {
    plugin.save.mockClear();
    const textInputs = tab.containerEl.querySelectorAll('input[type="text"]');
    const authUserInput = textInputs[8];
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
    const h3 = tab.containerEl.querySelector('h3');
    expect(h3).not.toBeNull();
    expect(h3!.textContent).toBe('Advanced');
  });

  it('<hr> and <h3> appear after the 7th existing Setting children and before the Advanced rows', () => {
    const children = Array.from(tab.containerEl.children);
    // 7 existing: indices 0-13; hr: 14; h3: 15; toggle: 16-17; 5 Advanced text/password: 18-27
    const hrIndex = children.findIndex(c => c.tagName === 'HR');
    const h3Index = children.findIndex(c => c.tagName === 'H3');
    // hr comes after 7 existing settings (14 children) = after index 13
    expect(hrIndex).toBe(14);
    expect(h3Index).toBe(15);
  });

  it('Portal host row has description text', () => {
    const containerText = tab.containerEl.textContent ?? '';
    expect(containerText).toContain('Hostname or full URL. Defaults to HTTPS unless http:// is prefixed.');
  });
});
