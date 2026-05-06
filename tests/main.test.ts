import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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

  describe('timer-dependent', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('save() triggers DebouncedSaver which calls saveData(data) after 500ms', async () => {
      await plugin.onload();
      plugin.save();
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      expect(plugin.saveData).toHaveBeenCalledWith(plugin.data);
    });

    it('onunload flushes a pending save immediately', async () => {
      await plugin.onload();
      plugin.save();
      plugin.onunload();
      await Promise.resolve();
      expect(plugin.saveData).toHaveBeenCalledWith(plugin.data);
    });
  });

  it('onload calls addSettingTab once with a GrimoireSettingTab instance', async () => {
    await plugin.onload();

    expect(plugin.addSettingTab).toHaveBeenCalledOnce();
    expect(plugin.addSettingTab.mock.calls[0][0]).toBeInstanceOf(GrimoireSettingTab);
  });

  it('onload registers the open-command-popup command', async () => {
    await plugin.onload();

    expect(plugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'open-command-popup' }),
    );
  });

  it('command callback constructs CommandPopup with app, spellTag, imprintAction, defaults', async () => {
    await plugin.onload();

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const popupSpy = vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function() {
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-command-popup'
    );
    expect(commandCall).toBeDefined();
    const callback = commandCall![0].callback;

    callback();

    expect(popupSpy).toHaveBeenCalledOnce();
    const [arg0, arg1, arg2, arg3] = popupSpy.mock.calls[0];
    expect(arg0).toBe(plugin.app);
    expect(arg1).toBe(plugin.data.settings.spellTag);
    expect(typeof arg2).toBe('function');
    expect(arg3).toMatchObject({
      defaultModel: plugin.data.settings.defaultModel,
      defaultEffort: plugin.data.settings.defaultEffort,
    });

    popupSpy.mockRestore();
  });

  it('command callback snapshots defaults from settings at the time the command fires', async () => {
    await plugin.onload();

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const popupSpy = vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function() {
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-command-popup'
    );
    const callback = commandCall![0].callback;

    callback();
    const firstDefaults = popupSpy.mock.calls[0][3];
    expect(firstDefaults.defaultModel).toBe('claude-sonnet-4-5');

    plugin.data.settings.defaultModel = 'claude-opus-4-5';

    callback();
    const secondDefaults = popupSpy.mock.calls[1][3];
    expect(secondDefaults.defaultModel).toBe('claude-opus-4-5');

    popupSpy.mockRestore();
  });

  it('imprintAction closure calls ForgeImprinter.imprint with snapshot, settings, and a close fn', async () => {
    await plugin.onload();

    const ForgeImprinterModule = await import('../src/forge/ForgeImprinter');
    const imprintSpy = vi.spyOn(ForgeImprinterModule.ForgeImprinter.prototype, 'imprint').mockImplementation(() => {});

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    let capturedAction: ((snapshot: any) => void) | undefined;
    const popupMock = { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() };
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(_app: any, _tag: any, action: any) {
      capturedAction = action;
      return popupMock as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-command-popup'
    );
    commandCall![0].callback();

    expect(capturedAction).toBeDefined();
    const stubSnapshot = { name: 'test', description: 'desc', model: 'claude-sonnet-4-5', effort: 'medium' as const };
    capturedAction!(stubSnapshot);

    expect(imprintSpy).toHaveBeenCalledOnce();
    expect(imprintSpy).toHaveBeenCalledWith(
      stubSnapshot,
      plugin.data.settings,
      expect.any(Function),
    );

    // Verify closeRef chain: invoking the captured close fn must call through to popup.close()
    const closeFn = imprintSpy.mock.calls[0][2] as () => void;
    closeFn();
    expect(popupMock.close).toHaveBeenCalledOnce();

    imprintSpy.mockRestore();
  });
});
