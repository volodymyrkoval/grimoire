import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { App } from 'obsidian';
import GrimoirePlugin from '../src/main';

vi.mock('../src/domain/settings/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/vault'),
}));

describe('GrimoirePlugin', () => {
  it('loads', () => {
    expect(true).toBe(true);
  });
});

describe('C — close wiring', () => {
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

  it('dispatcher close callback can be invoked immediately after construction and successfully closes popup', async () => {
    await plugin.onload();

    // Mock CommandPopup to capture reference
    const CommandPopupModule = await import('../src/ui/CommandPopup');
    const popupMock = { open: vi.fn(), close: vi.fn(), scope: { register: vi.fn(), unregister: vi.fn() }, contentEl: {}, onOpen: vi.fn(), onClose: vi.fn() };
    vi.spyOn(CommandPopupModule, 'CommandPopup').mockImplementation(function() {
      return popupMock as any;
    } as any);

    const CastDispatcherModule = await import('../src/cast/CastDispatcher');
    const OriginalDispatcher = CastDispatcherModule.CastDispatcher;
    let capturedCloseCallback: (() => void) | undefined;
    let closeWasInvokedDuringConstruction = false;
    const dispatcherSpy = vi.spyOn(CastDispatcherModule, 'CastDispatcher').mockImplementation((deps: any) => {
      capturedCloseCallback = deps.close;
      capturedCloseCallback();
      closeWasInvokedDuringConstruction = true;
      return new OriginalDispatcher(deps);
    });

    const commandCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].id === 'open-popup'
    );
    expect(commandCall).toBeDefined();
    commandCall![0].callback();

    expect(closeWasInvokedDuringConstruction).toBe(true);
    expect(popupMock.close).toHaveBeenCalledOnce();

    dispatcherSpy.mockRestore();
  });
});
