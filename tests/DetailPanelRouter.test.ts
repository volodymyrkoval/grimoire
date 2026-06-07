/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { DetailPanelRouter, type DetailPanelRouterDeps } from '../src/ui/popup/DetailPanelRouter';
import { buildHotkeyDirectory } from '../src/forge/HotkeyDirectory';
import { modelId } from '../src/domain/settings/ModelId';

function buildDetailPanelRouterDeps(overrides?: Partial<DetailPanelRouterDeps>): DetailPanelRouterDeps {
  return {
    formDefaults: { defaultModel: modelId('sonnet'), defaultEffort: 'medium' },
    overrides: { has: vi.fn() } as any,
    sessionMap: {} as any,
    app: {} as any,
    models: [],
    imprintAction: vi.fn(),
    castAction: vi.fn(),
    refineCastAction: vi.fn(),
    settingsActiveRefinePath: null,
    onOverrideChanged: vi.fn(),
    onEnterDetail: vi.fn(),
    onExit: vi.fn(),
    reattachTabBar: vi.fn(),
    forgeUpdateAction: vi.fn(),
    spellContentReader: {} as any,
    hotkeyDirectoryFactory: () => buildHotkeyDirectory([]),
    hotkeyEraser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('DetailPanelRouter', () => {
  it('can construct with hotkeyDirectoryFactory and hotkeyEraser in deps', () => {
    const deps = buildDetailPanelRouterDeps();
    const router = new DetailPanelRouter(deps);
    expect(router).toBeDefined();
  });

  it('calls hotkeyDirectoryFactory when rendering Forge create form', () => {
    const hotkeyDirectoryFactory = vi.fn().mockReturnValue(buildHotkeyDirectory([]));
    const deps = buildDetailPanelRouterDeps({ hotkeyDirectoryFactory });
    const router = new DetailPanelRouter(deps);

    const contentEl = document.createElement('div');
    const scope = {
      register: vi.fn().mockReturnValue({}),
      unregister: vi.fn(),
    } as any;

    router.renderForge(contentEl, scope);
    expect(hotkeyDirectoryFactory).toHaveBeenCalled();
  });
});
