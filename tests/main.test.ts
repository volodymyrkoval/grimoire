import { vi, describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import { GrimoireSettingTab } from '../src/ui/settings/GrimoireSettingTab';
import GrimoirePlugin from '../src/main';

vi.mock('../src/domain/settings/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/vault'),
}));

describe('GrimoirePlugin', () => {
  let app: App;
  let plugin: GrimoirePlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new App();
    plugin = new GrimoirePlugin(app as any);
  });

  it('onload calls loadData and sets plugin.data to hydrated GrimoireData', async () => {
    await plugin.onload();

    expect(plugin.loadData).toHaveBeenCalledOnce();
    expect(plugin.data).toBeDefined();
    expect(plugin.data.settings).toMatchObject({ spellTag: expect.any(String) });
  });

  it('save() triggers DebouncedSaver which calls saveData(data) after 500ms', async () => {
    vi.useFakeTimers();
    await plugin.onload();

    plugin.save();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(plugin.saveData).toHaveBeenCalledWith(plugin.data);
    vi.useRealTimers();
  });

  it('onload calls addSettingTab once with a GrimoireSettingTab instance', async () => {
    await plugin.onload();

    expect(plugin.addSettingTab).toHaveBeenCalledOnce();
    expect(plugin.addSettingTab.mock.calls[0][0]).toBeInstanceOf(GrimoireSettingTab);
  });

  it('onunload flushes a pending save immediately', async () => {
    vi.useFakeTimers();
    await plugin.onload();

    plugin.save();
    plugin.onunload();
    await Promise.resolve();

    expect(plugin.saveData).toHaveBeenCalledWith(plugin.data);
    vi.useRealTimers();
  });

  it('onload registers the open-command-popup command', async () => {
    await plugin.onload();

    expect(plugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'open-command-popup' }),
    );
  });
});
