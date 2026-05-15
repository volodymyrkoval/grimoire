import { vi, describe, it, expect } from 'vitest';
import { App } from 'obsidian';

// Mock CommandPopup and CastDispatcher before importing CommandPopupBuilder
const commandPopupMock = {
  open: vi.fn(),
  close: vi.fn(),
  scope: { register: vi.fn(), unregister: vi.fn() },
  contentEl: {},
  onOpen: vi.fn(),
  onClose: vi.fn(),
};

const castDispatcherMock = {
  dispatch: vi.fn(),
};

vi.mock('../src/ui/CommandPopup', () => ({
  CommandPopup: vi.fn(() => commandPopupMock),
}));

vi.mock('../src/cast/CastDispatcher', () => ({
  CastDispatcher: vi.fn(() => castDispatcherMock),
}));

vi.mock('../src/domain/settings/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/vault'),
}));

describe('CommandPopupBuilder', () => {
  it('build() calls CommandPopup constructor exactly once with a single param object', async () => {
    const { CommandPopupBuilder } = await import('../src/ui/popup/CommandPopupBuilder');
    const { CommandPopup } = await import('../src/ui/CommandPopup');
    const { OptionsSessionMap } = await import('../src/ui/options/OptionsSessionMap');
    const { SpellOverrideStore } = await import('../src/domain/settings/SpellOverrideStore');

    const app = new App();
    const pluginData = {
      data: {
        settings: {
          spellTag: 'test-tag',
          defaultModel: 'claude-sonnet-4-5',
          defaultEffort: 'medium' as const,
          executionMode: 'local' as const,
        },
      },
      overrides: new SpellOverrideStore({
        data: { settings: { spellTag: 'test-tag' } } as any,
        saver: { schedule: vi.fn() } as any,
      }),
    };
    const imprinter = { imprint: vi.fn() };
    const sessionMap = new OptionsSessionMap();
    const castLogPanelDeps = {
      source: { poll: vi.fn() },
      refresh: vi.fn(),
      tick: vi.fn(),
      now: vi.fn(),
    };
    let capturedCloseCallback: (() => void) | undefined;
    const createDispatcher = vi.fn((close: () => void) => {
      capturedCloseCallback = close;
      return castDispatcherMock;
    });

    const mockPaths = {
      refineSpellPathVaultRel: vi.fn(() => '.obsidian/plugins/grimoire/refine.md'),
    } as any;

    const builder = new CommandPopupBuilder({
      app,
      plugin: pluginData as any,
      imprinter: imprinter as any,
      sessionMap,
      castLogPanelDeps,
      createDispatcher,
      paths: mockPaths,
    });

    vi.clearAllMocks();
    const popup = builder.build();

    // Assert CommandPopup constructor was called exactly once
    expect(CommandPopup).toHaveBeenCalledOnce();
    expect(CommandPopup).toHaveBeenCalledWith(expect.any(Object));

    // Assert single param object shape matches the expected CommandPopupParams
    const params = (CommandPopup as any).mock.calls[0][0];
    expect(params).toHaveProperty('app', app);
    expect(params).toHaveProperty('spellTag', 'test-tag');
    expect(params).toHaveProperty('imprintAction');
    expect(typeof params.imprintAction).toBe('function');
    expect(params).toHaveProperty('castAction');
    expect(typeof params.castAction).toBe('function');
    expect(params).toHaveProperty('defaults');
    expect(params.defaults).toEqual({
      defaultModel: 'claude-sonnet-4-5',
      defaultEffort: 'medium',
    });
    expect(params).toHaveProperty('overrides', pluginData.overrides);
    expect(params).toHaveProperty('sessionMap', sessionMap);
    expect(params).toHaveProperty('castLogPanelDeps', castLogPanelDeps);

    // Assert createDispatcher was called exactly once with a function
    expect(createDispatcher).toHaveBeenCalledOnce();
    expect(typeof createDispatcher.mock.calls[0][0]).toBe('function');

    // Assert the close callback passed to createDispatcher calls popup.close() when invoked
    expect(capturedCloseCallback).toBeDefined();
    vi.clearAllMocks();
    capturedCloseCallback!();
    expect(popup.close).toHaveBeenCalledOnce();
  });
});
