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

  let materializerMock: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const HookMaterializerModule = await import('../src/castLog/HookMaterializer');
    const OriginalMaterializer = HookMaterializerModule.HookMaterializer;
    materializerMock = vi.spyOn(HookMaterializerModule, 'HookMaterializer').mockImplementation((ports: any) => {
      const inst = new OriginalMaterializer(ports);
      vi.spyOn(inst, 'run').mockResolvedValue(undefined);
      return inst;
    });
  });

  afterEach(() => {
    materializerMock?.mockRestore();
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

  it('onload registers the open-popup command', async () => {
    await plugin.onload();

    expect(plugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'open-popup' }),
    );
  });

  it('command callback constructs CommandPopup with app, spellTag, imprintAction, castAction, defaults, overrides, sessionMap', async () => {
    await plugin.onload();

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const popupSpy = vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function() {
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    expect(commandCall).toBeDefined();
    const callback = commandCall![0].callback;

    callback();

    expect(popupSpy).toHaveBeenCalledOnce();
    expect(popupSpy.mock.calls[0]).toHaveLength(1);
    const params = popupSpy.mock.calls[0][0] as any;
    expect(params.app).toBe(plugin.app);
    expect(params.spellTag).toBe(plugin.data.settings.spellTag);
    expect(typeof params.imprintAction).toBe('function');
    expect(typeof params.castAction).toBe('function');
    expect(params.defaults).toStrictEqual({
      defaultModel: 'claude-sonnet-4-5',
      defaultEffort: 'medium',
    });
    expect(params.overrides).toBe(plugin.overrides);
    const { OptionsSessionMap } = await import('../src/ui/options/OptionsSessionMap');
    expect(params.sessionMap).toBeInstanceOf(OptionsSessionMap);
    expect(params.optionsCastAction).toBeUndefined();

    popupSpy.mockRestore();
  });

  it('command callback snapshots defaults from settings at the time the command fires', async () => {
    await plugin.onload();

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const popupSpy = vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function() {
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    const callback = commandCall![0].callback;

    callback();
    const firstDefaults = popupSpy.mock.calls[0][0].defaults;
    expect(firstDefaults.defaultModel).toBe('claude-sonnet-4-5');

    plugin.data.settings.defaultModel = 'claude-opus-4-5';

    callback();
    const secondDefaults = popupSpy.mock.calls[1][0].defaults;
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
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(params: any) {
      capturedAction = params.imprintAction;
      return popupMock as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
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
    let capturedCastAction: ((spell: any, snapshot: any) => void) | undefined;
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(params: any) {
      capturedCastAction = params.castAction;
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    commandCall![0].callback();

    expect(capturedCastAction).toBeDefined();

    (app as any).workspace.getActiveFile.mockReturnValue({ path: 'notes/active.md', basename: 'active' });
    const stubSpell = { name: 'Test Spell', path: 'spells/test.md', executeOnNote: true };
    const stubSnapshot = {
      model: plugin.data.settings.defaultModel,
      effort: plugin.data.settings.defaultEffort,
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };
    capturedCastAction!(stubSpell, stubSnapshot);

    expect(dispatchSpy).toHaveBeenCalledOnce();
    expect(dispatchSpy).toHaveBeenCalledWith({
      spell: stubSpell,
      model: plugin.data.settings.defaultModel,
      effort: plugin.data.settings.defaultEffort,
      contextNotePaths: [],
      followUp: '',
      settings: plugin.data.settings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    dispatchSpy.mockRestore();
  });

  it('settings mutation is reflected in subsequent popups', async () => {
    await plugin.onload();

    const dispatchSpy = vi.spyOn(CastDispatcher.prototype, 'dispatch').mockImplementation(() => {});

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const capturedCastActions: Array<(spell: any, snapshot: any) => void> = [];
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(params: any) {
      capturedCastActions.push(params.castAction);
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );

    commandCall![0].callback();
    plugin.data.settings.defaultModel = 'different-model';
    commandCall![0].callback();

    expect(capturedCastActions).toHaveLength(2);

    const stubSpell = { name: 'Stub Spell', path: 'spells/stub.md' };
    const stubSnapshot = {
      model: 'some-model',
      effort: 'medium' as const,
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };
    capturedCastActions[1]!(stubSpell, stubSnapshot);

    expect(dispatchSpy).toHaveBeenCalledOnce();
    expect(dispatchSpy.mock.calls[0][0]).toMatchObject({ model: 'some-model' });

    dispatchSpy.mockRestore();
  });

  it('castAction closure dispatches with snapshot values and current settings', async () => {
    await plugin.onload();

    const dispatchSpy = vi.spyOn(CastDispatcher.prototype, 'dispatch').mockImplementation(() => {});

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    let capturedCastAction: ((spell: any, snapshot: any) => void) | undefined;
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function(params: any) {
      capturedCastAction = params.castAction;
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    commandCall![0].callback();

    expect(capturedCastAction).toBeDefined();

    (app as any).workspace.getActiveFile.mockReturnValue({ path: 'notes/active.md', basename: 'active' });
    const stubSpell = { name: 'Test Spell', path: 'spells/test.md' };
    const stubSnapshot = {
      model: 'claude-opus-4-5',
      effort: 'high' as const,
      contextNotePaths: ['notes/context1.md', 'notes/context2.md'],
      followUp: 'This is a follow-up.',
      executeOnNote: true,
    };
    capturedCastAction!(stubSpell, stubSnapshot);

    expect(dispatchSpy).toHaveBeenCalledOnce();
    expect(dispatchSpy).toHaveBeenCalledWith({
      spell: stubSpell,
      model: 'claude-opus-4-5',
      effort: 'high',
      contextNotePaths: ['notes/context1.md', 'notes/context2.md'],
      followUp: 'This is a follow-up.',
      settings: plugin.data.settings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    dispatchSpy.mockRestore();
  });

  it('onload constructs HookMaterializer once for agent-hooks (hooksDir: agent-hooks)', async () => {
    const HookMaterializerModule = await import('../src/castLog/HookMaterializer');
    const OriginalMaterializer = HookMaterializerModule.HookMaterializer;
    const materializerSpy = vi.spyOn(HookMaterializerModule, 'HookMaterializer').mockImplementation((ports: any) => {
      const inst = new OriginalMaterializer(ports);
      vi.spyOn(inst, 'run').mockResolvedValue(undefined);
      return inst;
    });

    await plugin.onload();

    expect(materializerSpy).toHaveBeenCalledTimes(1);
    expect(materializerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        getPluginDirAbs: expect.any(Function),
        getLogPathAbs: expect.any(Function),
        hooksDir: 'agent-hooks',
      }),
    );

    materializerSpy.mockRestore();
  });


  it('onload constructs ScratchSweeper exactly once with getScratchDirAbs port and calls sweep()', async () => {
    const ScratchSweeperModule = await import('../src/castLog/ScratchSweeper');
    const OriginalSweeper = ScratchSweeperModule.ScratchSweeper;
    let capturedSweepSpy: ReturnType<typeof vi.fn> | undefined;
    const sweeperSpy = vi.spyOn(ScratchSweeperModule, 'ScratchSweeper').mockImplementation((ports: any) => {
      const inst = new OriginalSweeper(ports);
      capturedSweepSpy = vi.spyOn(inst, 'sweep').mockResolvedValue(undefined);
      return inst;
    });

    // Also mock HookMaterializer.run so onload doesn't hit the filesystem
    const HookMaterializerModule = await import('../src/castLog/HookMaterializer');
    const OriginalMaterializer = HookMaterializerModule.HookMaterializer;
    const materializerSpy = vi.spyOn(HookMaterializerModule, 'HookMaterializer').mockImplementation((ports: any) => {
      const inst = new OriginalMaterializer(ports);
      vi.spyOn(inst, 'run').mockResolvedValue(undefined);
      return inst;
    });

    await plugin.onload();

    expect(sweeperSpy).toHaveBeenCalledTimes(1);
    expect(sweeperSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        getScratchDirAbs: expect.any(Function),
      }),
    );
    expect(capturedSweepSpy).toHaveBeenCalledOnce();

    sweeperSpy.mockRestore();
    materializerSpy.mockRestore();
  });

  it('onload resolves even when HookMaterializer.run rejects, and plugin remains functional', async () => {
    const HookMaterializerModule = await import('../src/castLog/HookMaterializer');
    const OriginalMaterializer = HookMaterializerModule.HookMaterializer;
    const materializerSpy = vi.spyOn(HookMaterializerModule, 'HookMaterializer').mockImplementation((ports: any) => {
      const inst = new OriginalMaterializer(ports);
      vi.spyOn(inst, 'run').mockRejectedValue(new Error('disk full'));
      return inst;
    });

    await expect(plugin.onload()).resolves.toBeUndefined();

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const popupSpy = vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function() {
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup',
    );
    expect(commandCall).toBeDefined();
    commandCall![0].callback();

    expect(popupSpy).toHaveBeenCalledOnce();

    popupSpy.mockRestore();
    materializerSpy.mockRestore();
  });

  it('onload invokes new CastLogStore once with both getters (single local store; remote is read-side fan-in)', async () => {
    const CastLogStoreModule = await import('../src/castLog/store');
    const OriginalStore = CastLogStoreModule.CastLogStore;
    const storeSpy = vi.spyOn(CastLogStoreModule, 'CastLogStore').mockImplementation((deps: any) => {
      return new OriginalStore(deps);
    });

    await plugin.onload();

    expect(storeSpy).toHaveBeenCalledTimes(1);
    expect(storeSpy.mock.calls[0][0]).toMatchObject({
      getLogPathAbs: expect.any(Function),
      getAgentLogPathAbs: expect.any(Function),
    });

    storeSpy.mockRestore();
  });

  it('ForgeImprinter constructor receives a caster thunk and logWriter instead of castLogStore/remoteTransport', async () => {
    const ForgeImprinterModule = await import('../src/forge/ForgeImprinter');
    const OriginalForgeImprinter = ForgeImprinterModule.ForgeImprinter;
    const imprintSpy = vi.spyOn(ForgeImprinterModule, 'ForgeImprinter').mockImplementation((deps: any) => {
      return new OriginalForgeImprinter(deps);
    });

    await plugin.onload();

    expect(imprintSpy).toHaveBeenCalledOnce();
    const deps = imprintSpy.mock.calls[0][0] as any;
    expect(typeof deps.caster).toBe('function');
    expect(deps.logWriter).toBeDefined();
    expect(deps.castLogStore).toBeUndefined();
    expect(deps.remoteTransport).toBeUndefined();

    imprintSpy.mockRestore();
  });

  it('command callback passes castLogPanelDeps to CommandPopup with source, refresh, tick, and now', async () => {
    await plugin.onload();

    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const popupSpy = vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function() {
      return { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() } as any;
    } as any);

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    commandCall![0].callback();

    expect(popupSpy).toHaveBeenCalledOnce();
    const params = popupSpy.mock.calls[0][0] as any;
    expect(params.castLogPanelDeps).toBeDefined();
    expect(typeof params.castLogPanelDeps.source?.load).toBe('function');
    expect(typeof params.castLogPanelDeps.refresh?.start).toBe('function');
    expect(typeof params.castLogPanelDeps.refresh?.stop).toBe('function');
    expect(typeof params.castLogPanelDeps.tick?.start).toBe('function');
    expect(typeof params.castLogPanelDeps.tick?.stop).toBe('function');
    expect(typeof params.castLogPanelDeps.now).toBe('function');

    popupSpy.mockRestore();
  });

  it('caster thunks pass settings to createCaster', async () => {
    const createCasterModule = await import('../src/cast/createCaster');
    const createCasterSpy = vi.spyOn(createCasterModule, 'createCaster').mockReturnValue({ cast: vi.fn() } as any);

    const CastDispatcherModule = await import('../src/cast/CastDispatcher');
    const OriginalDispatcher = CastDispatcherModule.CastDispatcher;
    const dispatcherSpy = vi.spyOn(CastDispatcherModule, 'CastDispatcher').mockImplementation((deps: any) => {
      return new OriginalDispatcher(deps);
    });

    await plugin.onload();

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    commandCall![0].callback();

    expect(dispatcherSpy).toHaveBeenCalledOnce();
    const casterThunk = dispatcherSpy.mock.calls[0][0].caster as () => any;

    casterThunk();

    expect(createCasterSpy).toHaveBeenCalledOnce();
    expect(createCasterSpy.mock.calls[0].length).toBe(2);

    createCasterSpy.mockRestore();
    dispatcherSpy.mockRestore();
  });

  it('CastLogStore receives getAgentLogPathAbs port on construction', async () => {
    const CastLogStoreModule = await import('../src/castLog/store');
    const OriginalStore = CastLogStoreModule.CastLogStore;
    const storeSpy = vi.spyOn(CastLogStoreModule, 'CastLogStore').mockImplementation((deps: any) => {
      return new OriginalStore(deps);
    });

    await plugin.onload();

    expect(storeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        getLogPathAbs: expect.any(Function),
        getAgentLogPathAbs: expect.any(Function),
      })
    );

    storeSpy.mockRestore();
  });

  it('CastDispatcher constructor receives a caster thunk and logWriter instead of castLogStore/remoteTransport', async () => {
    const CastDispatcherModule = await import('../src/cast/CastDispatcher');
    const OriginalDispatcher = CastDispatcherModule.CastDispatcher;
    const dispatcherSpy = vi.spyOn(CastDispatcherModule, 'CastDispatcher').mockImplementation((deps: any) => {
      return new OriginalDispatcher(deps);
    });

    await plugin.onload();

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    commandCall![0].callback();

    expect(dispatcherSpy).toHaveBeenCalledOnce();
    const deps = dispatcherSpy.mock.calls[0][0] as any;
    expect(typeof deps.caster).toBe('function');
    expect(deps.logWriter).toBeDefined();
    expect(deps.castLogStore).toBeUndefined();
    expect(deps.remoteTransport).toBeUndefined();

    dispatcherSpy.mockRestore();
  });

  it('onload constructs ForgeMaterializer exactly once and awaits its run()', async () => {
    const ForgeMaterializerModule = await import('../src/forge/ForgeMaterializer');
    const OriginalForgeMaterializer = ForgeMaterializerModule.ForgeMaterializer;
    let capturedRunSpy: ReturnType<typeof vi.fn> | undefined;
    const forgeMaterializerSpy = vi.spyOn(ForgeMaterializerModule, 'ForgeMaterializer').mockImplementation((ports: any) => {
      const inst = new OriginalForgeMaterializer(ports);
      capturedRunSpy = vi.spyOn(inst, 'run').mockResolvedValue(undefined);
      return inst;
    });

    await plugin.onload();

    expect(forgeMaterializerSpy).toHaveBeenCalledTimes(1);
    expect(capturedRunSpy).toHaveBeenCalledTimes(1);

    forgeMaterializerSpy.mockRestore();
  });

  it('ForgeImprinter constructor receives forgeSpellPaths thunk returning paths derived from vaultMountPath and PluginPaths', async () => {
    const ForgeImprinterModule = await import('../src/forge/ForgeImprinter');
    const OriginalForgeImprinter = ForgeImprinterModule.ForgeImprinter;
    const imprintSpy = vi.spyOn(ForgeImprinterModule, 'ForgeImprinter').mockImplementation((deps: any) => {
      return new OriginalForgeImprinter(deps);
    });

    await plugin.onload();

    expect(imprintSpy).toHaveBeenCalledOnce();
    const deps = imprintSpy.mock.calls[0][0] as any;
    expect(typeof deps.forgeSpellPaths).toBe('function');

    const forgePaths = deps.forgeSpellPaths();
    const { PluginPaths } = await import('../src/infra/PluginPaths');
    // manifest.dir is '.obsidian/plugins/test' in the mock Plugin
    const pluginPaths = new PluginPaths((plugin as any).manifest.dir);
    expect(forgePaths.vaultRelForPortal).toBe(pluginPaths.forgeSpellPathVaultRel());
    expect(forgePaths.absForCaster).toContain(pluginPaths.forgeSpellPathVaultRel());

    imprintSpy.mockRestore();
  });

  it('tc4: registers CM6 editor extension on load', async () => {
    // call plugin.onload() — it's async
    await plugin.onload();
    expect(plugin.registerEditorExtension).toHaveBeenCalled();
    expect(plugin.registerEditorExtension).toHaveBeenCalledWith(expect.anything());
  });

  it('CastDispatcher and ForgeImprinter caster thunks invoke createCaster with current settings', async () => {
    const createCasterModule = await import('../src/cast/createCaster');
    const createCasterSpy = vi.spyOn(createCasterModule, 'createCaster');

    const ForgeImprinterModule = await import('../src/forge/ForgeImprinter');
    const OriginalForgeImprinter = ForgeImprinterModule.ForgeImprinter;
    const imprintSpy = vi.spyOn(ForgeImprinterModule, 'ForgeImprinter').mockImplementation((deps: any) => {
      return new OriginalForgeImprinter(deps);
    });

    const CastDispatcherModule = await import('../src/cast/CastDispatcher');
    const OriginalDispatcher = CastDispatcherModule.CastDispatcher;
    const dispatcherSpy = vi.spyOn(CastDispatcherModule, 'CastDispatcher').mockImplementation((deps: any) => {
      return new OriginalDispatcher(deps);
    });

    await plugin.onload();

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    commandCall![0].callback();

    expect(dispatcherSpy).toHaveBeenCalledOnce();
    expect(imprintSpy).toHaveBeenCalledOnce();

    // invoke both thunks to confirm they call createCaster with settings
    const dispatcherCasterThunk = dispatcherSpy.mock.calls[0][0].caster as () => any;
    const imprinterCasterThunk = (imprintSpy.mock.calls[0][0] as any).caster as () => any;

    createCasterSpy.mockImplementation(() => ({} as any));
    dispatcherCasterThunk();
    imprinterCasterThunk();

    expect(createCasterSpy).toHaveBeenCalledTimes(2);
    expect(createCasterSpy.mock.calls[0][0]).toBe(plugin.data.settings);
    expect(createCasterSpy.mock.calls[1][0]).toBe(plugin.data.settings);

    createCasterSpy.mockRestore();
    imprintSpy.mockRestore();
    dispatcherSpy.mockRestore();
  });
});
