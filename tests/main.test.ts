import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { App } from 'obsidian';
import { GrimoireSettingTab } from '../src/ui/settings/GrimoireSettingTab';
import GrimoirePlugin from '../src/main';
import { CastDispatcher } from '../src/cast/CastDispatcher';

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

  it('command callback constructs CommandPopup with app, spellTag, imprintAction, castAction, defaults, overrides, sessionMap, optionsCastAction', async () => {
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
    expect(popupSpy.mock.calls[0]).toHaveLength(8);
    const [arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7] = popupSpy.mock.calls[0];
    expect(arg0).toBe(plugin.app);
    expect(arg1).toBe(plugin.data.settings.spellTag);
    expect(typeof arg2).toBe('function');
    expect(typeof arg3).toBe('function');
    expect(arg4).toStrictEqual({
      defaultModel: 'claude-sonnet-4-5',
      defaultEffort: 'medium',
    });
    expect(arg5).toBe(plugin.overrides);
    const { OptionsSessionMap } = await import('../src/ui/options/OptionsSessionMap');
    expect(arg6).toBeInstanceOf(OptionsSessionMap);
    expect(typeof arg7).toBe('function');

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
    const firstDefaults = popupSpy.mock.calls[0][4];
    expect(firstDefaults.defaultModel).toBe('claude-sonnet-4-5');

    plugin.data.settings.defaultModel = 'claude-opus-4-5';

    callback();
    const secondDefaults = popupSpy.mock.calls[1][4];
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

  it('cast action dispatches with current settings', async () => {
    await plugin.onload();

    const dispatchSpy = vi.spyOn(CastDispatcher.prototype, 'dispatch').mockImplementation(() => {});

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    let capturedCastAction: ((spell: any) => void) | undefined;
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(_app: any, _tag: any, _imprint: any, castAction: any) {
      capturedCastAction = castAction;
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-command-popup'
    );
    commandCall![0].callback();

    expect(capturedCastAction).toBeDefined();

    (app as any).workspace.getActiveFile.mockReturnValue({ path: 'notes/active.md', basename: 'active' });
    const stubSpell = { name: 'Test Spell', path: 'spells/test.md' };
    capturedCastAction!(stubSpell);

    expect(dispatchSpy).toHaveBeenCalledOnce();
    expect(dispatchSpy).toHaveBeenCalledWith({
      spell: stubSpell,
      model: plugin.data.settings.defaultModel,
      effort: plugin.data.settings.defaultEffort,
      contextNotePaths: [],
      followUp: '',
      settings: plugin.data.settings,
      activeFilePath: 'notes/active.md',
    });

    dispatchSpy.mockRestore();
  });

  it('settings mutation is reflected in subsequent popups', async () => {
    await plugin.onload();

    const dispatchSpy = vi.spyOn(CastDispatcher.prototype, 'dispatch').mockImplementation(() => {});

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const capturedCastActions: Array<(spell: any) => void> = [];
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(_app: any, _tag: any, _imprint: any, castAction: any) {
      capturedCastActions.push(castAction);
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-command-popup'
    );

    commandCall![0].callback();
    plugin.data.settings.defaultModel = 'different-model';
    commandCall![0].callback();

    expect(capturedCastActions).toHaveLength(2);

    const stubSpell = { name: 'Stub Spell', path: 'spells/stub.md' };
    capturedCastActions[1]!(stubSpell);

    expect(dispatchSpy).toHaveBeenCalledOnce();
    expect(dispatchSpy.mock.calls[0][0]).toMatchObject({ model: 'different-model' });

    dispatchSpy.mockRestore();
  });

  it('optionsCastAction closure dispatches with snapshot values and current settings', async () => {
    await plugin.onload();

    const dispatchSpy = vi.spyOn(CastDispatcher.prototype, 'dispatch').mockImplementation(() => {});

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    let capturedOptionsCastAction: ((spell: any, snapshot: any) => void) | undefined;
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(_app: any, _tag: any, _imprint: any, _castAction: any, _defaults: any, _overrides: any, _sessionMap: any, optionsCastAction: any) {
      capturedOptionsCastAction = optionsCastAction;
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-command-popup'
    );
    commandCall![0].callback();

    expect(capturedOptionsCastAction).toBeDefined();

    (app as any).workspace.getActiveFile.mockReturnValue({ path: 'notes/active.md', basename: 'active' });
    const stubSpell = { name: 'Test Spell', path: 'spells/test.md' };
    const stubSnapshot = {
      model: 'claude-opus-4-5',
      effort: 'high' as const,
      contextNotePaths: ['notes/context1.md', 'notes/context2.md'],
      followUp: 'This is a follow-up.',
    };
    capturedOptionsCastAction!(stubSpell, stubSnapshot);

    expect(dispatchSpy).toHaveBeenCalledOnce();
    expect(dispatchSpy).toHaveBeenCalledWith({
      spell: stubSpell,
      model: 'claude-opus-4-5',
      effort: 'high',
      contextNotePaths: ['notes/context1.md', 'notes/context2.md'],
      followUp: 'This is a follow-up.',
      settings: plugin.data.settings,
      activeFilePath: 'notes/active.md',
    });

    dispatchSpy.mockRestore();
  });
});
