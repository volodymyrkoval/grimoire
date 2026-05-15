import { vi, describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';

vi.mock('../src/domain/settings/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/vault'),
}));

describe('PopupModule', () => {
  let app: App;

  const makeSettings = () => ({
    spellTag: 'spell',
    defaultModel: 'claude-sonnet-4-5',
    defaultEffort: 'medium' as const,
    executionMode: 'local' as const,
    cliCommand: '',
    binaryPath: '',
    forgeOutputFolder: '',
    vaultMountPath: '',
    portalHost: '',
    portalPort: '',
    portalPath: '',
    portalAuthUser: '',
    portalAuthPassword: '',
  });

  const makeCastLogModule = () => ({
    activeLogStore: vi.fn(() => ({ recordCasted: vi.fn() })),
    buildCastLogPanelDeps: vi.fn(() => ({
      source: { load: vi.fn() },
      refresh: { start: vi.fn(), stop: vi.fn() },
      tick: { start: vi.fn(), stop: vi.fn() },
      now: vi.fn(),
    })),
  });

  const HOOKS_DIR = '/vault/.obsidian/plugins/grimoire/agent-hooks';

  const makePaths = () => ({
    refineSpellPathVaultRel: vi.fn(() => '.obsidian/plugins/grimoire/refine.md'),
    agentHooksDirAbs: vi.fn(() => '.obsidian/plugins/grimoire/agent-hooks'),
  } as any);

  const makeModuleDeps = (settings: ReturnType<typeof makeSettings>, overrides: any, castLog: any) => ({
    app,
    getData: () => ({ settings, spellOverrides: {} }),
    overrides,
    castLog,
    getAgentHooksDirAbs: () => HOOKS_DIR,
    forgeSpellPaths: () => ({
      absForCaster: '/vault/.obsidian/plugins/grimoire/forge.md',
      vaultRelForPortal: '.obsidian/plugins/grimoire/forge.md',
    }),
    paths: makePaths(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = new App();
  });

  it('constructs without throwing given valid deps', async () => {
    const { PopupModule } = await import('../src/main/PopupModule');
    const settings = makeSettings();
    const overrides = { getOverride: vi.fn() } as any;
    const castLog = makeCastLogModule() as any;

    expect(() => {
      new PopupModule(makeModuleDeps(settings, overrides, castLog));
    }).not.toThrow();
  });

  it('register calls plugin.addCommand with open-popup id and correct name', async () => {
    const { PopupModule } = await import('../src/main/PopupModule');
    const settings = makeSettings();
    const overrides = { getOverride: vi.fn() } as any;
    const castLog = makeCastLogModule() as any;

    const module = new PopupModule(makeModuleDeps(settings, overrides, castLog));

    const fakePlugin = { addCommand: vi.fn() } as any;
    module.register(fakePlugin);

    expect(fakePlugin.addCommand).toHaveBeenCalledOnce();
    const cmd = fakePlugin.addCommand.mock.calls[0][0];
    expect(cmd.id).toBe('open-popup');
    expect(cmd.name).toBe('Open spell browser');
    expect(typeof cmd.callback).toBe('function');
  });

  it('command callback calls CommandPopupBuilder.build().open()', async () => {
    const CommandPopupBuilderModule = await import('../src/ui/popup/CommandPopupBuilder');
    const openMock = vi.fn();
    const buildMock = vi.fn(() => ({ open: openMock }));
    const builderSpy = vi.spyOn(CommandPopupBuilderModule, 'CommandPopupBuilder').mockImplementation(() => ({
      build: buildMock,
    }) as any);

    const { PopupModule } = await import('../src/main/PopupModule');
    const settings = makeSettings();
    const overrides = { getOverride: vi.fn() } as any;
    const castLog = makeCastLogModule() as any;

    const module = new PopupModule(makeModuleDeps(settings, overrides, castLog));

    const fakePlugin = { addCommand: vi.fn() } as any;
    module.register(fakePlugin);

    const cmd = fakePlugin.addCommand.mock.calls[0][0];
    cmd.callback();

    expect(buildMock).toHaveBeenCalledOnce();
    expect(openMock).toHaveBeenCalledOnce();

    builderSpy.mockRestore();
  });

  it('ForgeImprinter is constructed with caster thunk and logWriter thunk', async () => {
    const ForgeImprinterModule = await import('../src/forge/ForgeImprinter');
    const imprinterSpy = vi.spyOn(ForgeImprinterModule, 'ForgeImprinter').mockImplementation(() => ({
      imprint: vi.fn(),
    }) as any);

    const createCasterModule = await import('../src/cast/createCaster');
    const createCasterSpy = vi.spyOn(createCasterModule, 'createCaster').mockReturnValue({} as any);

    const { PopupModule } = await import('../src/main/PopupModule');
    const settings = makeSettings();
    const overrides = { getOverride: vi.fn() } as any;
    const castLog = makeCastLogModule() as any;

    new PopupModule(makeModuleDeps(settings, overrides, castLog));

    expect(imprinterSpy).toHaveBeenCalledOnce();
    const deps = imprinterSpy.mock.calls[0][0] as any;
    expect(typeof deps.caster).toBe('function');
    expect(typeof deps.logWriter).toBe('function');

    // Invoke thunks to verify they delegate correctly
    deps.caster();
    expect(createCasterSpy).toHaveBeenCalledWith(settings, HOOKS_DIR);

    deps.logWriter();
    expect(castLog.activeLogStore).toHaveBeenCalled();

    imprinterSpy.mockRestore();
    createCasterSpy.mockRestore();
  });

  it('createDispatcher factory produces a CastDispatcher with notify, close, caster, logWriter', async () => {
    const CommandPopupBuilderModule = await import('../src/ui/popup/CommandPopupBuilder');
    let capturedCreateDispatcher: ((close: () => void) => any) | undefined;
    vi.spyOn(CommandPopupBuilderModule, 'CommandPopupBuilder').mockImplementation((deps: any) => {
      capturedCreateDispatcher = deps.createDispatcher;
      return { build: () => ({ open: vi.fn() }) } as any;
    });

    const CastDispatcherModule = await import('../src/cast/CastDispatcher');
    const dispatcherSpy = vi.spyOn(CastDispatcherModule, 'CastDispatcher').mockImplementation(() => ({
      dispatch: vi.fn(),
    }) as any);

    const { PopupModule } = await import('../src/main/PopupModule');
    const settings = makeSettings();
    const overrides = { getOverride: vi.fn() } as any;
    const castLog = makeCastLogModule() as any;

    const module = new PopupModule(makeModuleDeps(settings, overrides, castLog));

    const fakePlugin = { addCommand: vi.fn() } as any;
    module.register(fakePlugin);
    fakePlugin.addCommand.mock.calls[0][0].callback();

    expect(capturedCreateDispatcher).toBeDefined();
    const closeFn = vi.fn();
    capturedCreateDispatcher!(closeFn);

    expect(dispatcherSpy).toHaveBeenCalledOnce();
    const dispatcherDeps = dispatcherSpy.mock.calls[0][0] as any;
    expect(typeof dispatcherDeps.notify).toBe('function');
    expect(dispatcherDeps.close).toBe(closeFn);
    expect(typeof dispatcherDeps.caster).toBe('function');
    expect(typeof dispatcherDeps.logWriter).toBe('function');

    dispatcherSpy.mockRestore();
  });

  it('OptionsSessionMap is owned by module (same instance passed to each popup build)', async () => {
    const CommandPopupBuilderModule = await import('../src/ui/popup/CommandPopupBuilder');
    const capturedSessionMaps: any[] = [];
    vi.spyOn(CommandPopupBuilderModule, 'CommandPopupBuilder').mockImplementation((deps: any) => {
      capturedSessionMaps.push(deps.sessionMap);
      return { build: () => ({ open: vi.fn() }) } as any;
    });

    const { PopupModule } = await import('../src/main/PopupModule');
    const settings = makeSettings();
    const overrides = { getOverride: vi.fn() } as any;
    const castLog = makeCastLogModule() as any;

    const module = new PopupModule(makeModuleDeps(settings, overrides, castLog));

    const fakePlugin = { addCommand: vi.fn() } as any;
    module.register(fakePlugin);

    // Trigger the callback twice
    const callback = fakePlugin.addCommand.mock.calls[0][0].callback;
    callback();
    callback();

    expect(capturedSessionMaps).toHaveLength(2);
    // Same instance both times
    expect(capturedSessionMaps[0]).toBe(capturedSessionMaps[1]);
  });
});
