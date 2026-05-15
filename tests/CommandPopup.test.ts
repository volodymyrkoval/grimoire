import { describe, it, expect, vi } from 'vitest';
import type { FormDefaults, CastAction } from '../src/ui/CommandPopup';
// obsidian is aliased to tests/__mocks__/obsidian.ts in vitest.config.ts
import { App } from 'obsidian';
import { CommandPopup } from '../src/ui/CommandPopup';
import * as FSDModule from '../src/ui/components/ForgeSentinelDetail';
import * as OptionsPanelModule from '../src/ui/options/OptionsPanel';
import { SpellOverrideStore } from '../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../src/ui/options/OptionsSessionMap';
import type { CastLogPanelDeps } from '../src/ui/tabs/CastLogPanel';

// EffortRow uses document.createElement — not available in the unit test environment
vi.mock('../src/ui/widgets/EffortRow', () => ({
  EffortRow: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    update: vi.fn(),
  })),
}));

// ForgeSentinelDetail uses document.createElement — stub it to register keyboard
// handlers on the scope (preserving suspend/resume semantics) without touching DOM.
vi.mock('../src/ui/components/ForgeSentinelDetail', async (importOriginal) => {
  const { KeyboardController } = await import('../src/infra/KeyboardController');
  return {
    ForgeSentinelDetail: vi.fn().mockImplementation(
      (scope: any) => {
        const kb = new KeyboardController(scope);
        kb.bind([], 'ArrowDown', () => false);
        kb.bind([], 'ArrowUp', () => false);
        return { destroy: () => kb.unbindAll(), render: vi.fn() };
      },
    ),
  };
});

const STUB_SPELLS = [
  { basename: 'Banishment Hex', path: '/spells/banishment.md' },
  { basename: 'Divination Ritual', path: '/spells/divination.md' },
  { basename: 'Enchantment Charm', path: '/spells/enchantment.md' },
  { basename: 'Healing Incantation', path: '/spells/healing.md' },
  { basename: 'Protection Rune', path: '/spells/protection.md' },
  { basename: 'Restoration Spell', path: '/spells/restoration.md' },
  { basename: 'Scrying Mirror', path: '/spells/scrying.md' },
  { basename: 'Summoning Circle', path: '/spells/summoning.md' },
  { basename: 'Transmutation', path: '/spells/transmutation.md' },
  { basename: 'Warding Barrier', path: '/spells/warding.md' },
];

function makeApp() {
  const app = new App() as any;
  app.vault.getMarkdownFiles.mockReturnValue(STUB_SPELLS);
  app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ['spell'] } });
  return app;
}

function makeStubOverrides() {
  return new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });
}

function makeFakeCastLogPanelDeps(): Omit<CastLogPanelDeps, 'openLink'> {
  return {
    source: { load: vi.fn().mockResolvedValue([]) },
    refresh: { start: vi.fn(), stop: vi.fn() },
    tick: { start: vi.fn(), stop: vi.fn() },
    now: () => new Date(),
  };
}

function makePopup(castAction?: CastAction) {
  return new CommandPopup({
    app: makeApp(),
    spellTag: 'spell',
    imprintAction: vi.fn(),
    castAction: castAction ?? vi.fn(),
    defaults: { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults,
    overrides: makeStubOverrides(),
    sessionMap: new OptionsSessionMap(),
    castLogPanelDeps: makeFakeCastLogPanelDeps(),
  });
}

// Real-enough Scope fake: simulates Obsidian's registration-order dispatch.
// register() returns a unique handle; unregister(handle) removes that binding;
// dispatch(key) walks bindings in registration order, invoking each matching
// callback until one returns false (consumed, in Obsidian's convention).
const installFakeScope = (popup: any) => {
  type Binding = { key: string; cb: (e: any) => any; handle: object };
  const bindings: (Binding | null)[] = [];
  popup.scope.register = vi.fn((_mods: any, key: string, cb: (e: any) => any) => {
    const handle = {};
    bindings.push({ key, cb, handle });
    return handle;
  });
  popup.scope.unregister = vi.fn((handle: object) => {
    const idx = bindings.findIndex((b) => b && b.handle === handle);
    if (idx >= 0) bindings[idx] = null;
  });
  const dispatch = (key: string) => {
    for (const b of bindings) {
      if (!b || b.key !== key) continue;
      const result = b.cb({ preventDefault: vi.fn() });
      if (result === false) return; // consumed
    }
  };
  return { dispatch };
};

describe('CommandPopup escape from forge sentinel detail', () => {
  // Obsidian's real Modal binds Escape directly to close() at the DOM layer,
  // bypassing the Scope. Simulate that by calling close() directly — the popup
  // must tear down ForgeSentinelDetail's scope bindings so they don't intercept
  // arrow keys after the popup re-binds its own.
  it('after close() (Obsidian Escape path) leaves forge detail, ArrowDown moves search selection', () => {
    const popup = makePopup();
    const { dispatch } = installFakeScope(popup as any);

    popup.onOpen();

    const spellsPanel = (popup as any).panels[0];
    const updateSpy = vi.spyOn(spellsPanel, 'updateSelection').mockImplementation(() => {});

    spellsPanel.events.emit('sentinel', { kind: 'forge', name: 'My Forge' });

    // Simulate Obsidian's built-in DOM-level Escape handler that calls close().
    popup.close();

    dispatch('ArrowDown');

    expect(updateSpy).toHaveBeenCalled();
  });
});

describe('CommandPopup keyboard suspend/resume', () => {
  it('suspends keyboard bindings when entering forge sentinel detail', () => {
    const popup = makePopup();
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    expect(scope.register.mock.calls.length).toBeGreaterThanOrEqual(4);

    scope.unregister.mockClear();

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('sentinel', { kind: 'forge', name: 'My Forge' });

    // suspend() must have unregistered all active handles
    expect(scope.unregister).toHaveBeenCalled();
  });

  it('resumes keyboard bindings when forge sentinel onBack fires', () => {
    const popup = makePopup();
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    const countAfterOpen = scope.register.mock.calls.length;

    let capturedOnBack: (() => void) | undefined;
    const OrigFSD = FSDModule.ForgeSentinelDetail;
    vi.spyOn(FSDModule, 'ForgeSentinelDetail' as any).mockImplementationOnce(
      function () {
        return Object.assign(Object.create(OrigFSD.prototype), {
          destroy: vi.fn(),
          render({ callbacks }: any) {
            capturedOnBack = callbacks.onBack;
          },
        });
      } as any
    );

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('sentinel', { kind: 'forge', name: 'My Forge' });

    expect(capturedOnBack).toBeDefined();
    capturedOnBack!();

    // resume() re-registers the original bindings — call count must exceed pre-suspend count
    expect(scope.register.mock.calls.length).toBeGreaterThan(countAfterOpen);
  });

  it('resumes keyboard bindings when forge sentinel onSubmit fires', () => {
    const popup = makePopup();
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    const countAfterOpen = scope.register.mock.calls.length;

    let capturedOnSubmit: ((...args: any[]) => void) | undefined;
    const OrigFSD = FSDModule.ForgeSentinelDetail;
    vi.spyOn(FSDModule, 'ForgeSentinelDetail' as any).mockImplementationOnce(
      function () {
        return Object.assign(Object.create(OrigFSD.prototype), {
          destroy: vi.fn(),
          render({ callbacks }: any) {
            capturedOnSubmit = callbacks.onSubmit;
          },
        });
      } as any
    );

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('sentinel', { kind: 'forge', name: 'My Forge' });

    expect(capturedOnSubmit).toBeDefined();
    capturedOnSubmit!({ name: '', description: '', model: 'sonnet', effort: null });

    expect(scope.register.mock.calls.length).toBeGreaterThan(countAfterOpen);
  });

});

describe('CommandPopup ArrowRight — open options', () => {
  it('ArrowRight in search phase on spells tab calls openOptions at selectedIndex', () => {
    const popup = makePopup();
    const { dispatch } = installFakeScope(popup as any);
    popup.onOpen();

    const spellsPanel = (popup as any).panels[0];
    // Prevent openOptions from emitting open-options (which would try to render OptionsPanel in node env)
    const openOptionsSpy = vi.spyOn(spellsPanel, 'openOptions').mockImplementation(() => {});

    dispatch('ArrowRight');

    expect(openOptionsSpy).toHaveBeenCalledWith(0);
  });

  it('ArrowRight in detail phase is a no-op', () => {
    const popup = makePopup();
    const { dispatch } = installFakeScope(popup as any);
    popup.onOpen();

    // Force detail phase directly without triggering ForgeSentinelDetail
    (popup as any).phase = 'detail';

    const spellsPanel = (popup as any).panels[0];
    const openOptionsSpy = vi.spyOn(spellsPanel, 'openOptions');
    dispatch('ArrowRight');

    expect(openOptionsSpy).not.toHaveBeenCalled();
  });
});

describe('CommandPopup open-options event → renderOptionsPanel', () => {
  it('open-options event on spellsPanel constructs OptionsPanel', () => {
    const popup = makePopup();
    popup.onOpen();

    const OrigOP = OptionsPanelModule.OptionsPanel;
    const constructorSpy = vi.spyOn(OptionsPanelModule, 'OptionsPanel' as any).mockImplementationOnce(
      function (..._args: any[]) {
        return Object.assign(Object.create(OrigOP.prototype), { destroy: vi.fn(), render: vi.fn() });
      } as any
    );

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('open-options', STUB_SPELLS[0]);

    expect(constructorSpy).toHaveBeenCalledOnce();
  });

  it('open-options event switches phase to detail', () => {
    const popup = makePopup();
    popup.onOpen();

    vi.spyOn(OptionsPanelModule, 'OptionsPanel' as any).mockImplementationOnce(
      function (..._args: any[]) {
        return { destroy: vi.fn(), render: vi.fn() };
      } as any
    );

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('open-options', STUB_SPELLS[0]);

    expect((popup as any).phase).toBe('detail');
  });
});

describe('CommandPopup switchTab lifecycle', () => {
  it('unmounts the outgoing panel before activating the next one', () => {
    // Regression: switching Spells → Logs → Spells used to call CastLogPanel.mount()
    // a second time without unmounting first, which re-started the
    // VaultRefreshCoordinator and threw "already started". switchTab must
    // unmount the currently active panel before swapping.
    const popup = makePopup();
    const { dispatch } = installFakeScope(popup as any);
    popup.onOpen();

    const panels = (popup as any).panels as any[];
    const logsPanel = panels.find((p: any) => p.id === 'logs');
    const unmountSpy = vi.spyOn(logsPanel, 'unmount');

    // Spells (active) → Logs (Tab #1) — logs.mount runs, no unmount expected on spells (no method)
    dispatch('Tab');
    expect(unmountSpy).not.toHaveBeenCalled();

    // Logs (active) → Spells (Tab #2) — logs.unmount must be called before switching
    dispatch('Tab');
    expect(unmountSpy).toHaveBeenCalledOnce();
  });
});

describe('CommandPopup G2 — CastLogPanel wiring', () => {
  it('panels array contains a CastLogPanel with id "logs" as the second panel', () => {
    const popup = makePopup();
    const panels = (popup as any).panels as any[];
    expect(panels).toHaveLength(2);
    expect(panels[1].id).toBe('logs');
  });

  it('onClose calls unmount() on panels that implement it', () => {
    const fakeDeps = makeFakeCastLogPanelDeps();
    const popup = new CommandPopup({
      app: makeApp(),
      spellTag: 'spell',
      imprintAction: vi.fn(),
      castAction: vi.fn(),
      defaults: { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults,
      overrides: makeStubOverrides(),
      sessionMap: new OptionsSessionMap(),
      castLogPanelDeps: fakeDeps,
    });

    const panels = (popup as any).panels as any[];
    const logsPanel = panels.find((p: any) => p.id === 'logs');
    const unmountSpy = vi.spyOn(logsPanel, 'unmount');

    popup.onClose();

    expect(unmountSpy).toHaveBeenCalledOnce();
  });

  it('CastLogPanel openLink calls workspace.openLinkText and then closes the popup', () => {
    const app = makeApp();
    const popup = new CommandPopup({
      app,
      spellTag: 'spell',
      imprintAction: vi.fn(),
      castAction: vi.fn(),
      defaults: { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults,
      overrides: makeStubOverrides(),
      sessionMap: new OptionsSessionMap(),
      castLogPanelDeps: makeFakeCastLogPanelDeps(),
    });

    const closeSpy = vi.spyOn(popup, 'close').mockImplementation(() => {});
    popup.openLink('Notes/result.md');

    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Notes/result.md', '', false);
    expect(closeSpy).toHaveBeenCalledOnce();
  });
});

describe('CommandPopup D5 — setHasOverride wired from overrides', () => {
  it('spellsPanel hasOverride predicate delegates to overrides.has()', () => {
    const stubOverrides = makeStubOverrides();
    const popup = new CommandPopup({
      app: makeApp(),
      spellTag: 'spell',
      imprintAction: vi.fn(),
      castAction: vi.fn(),
      defaults: { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults,
      overrides: stubOverrides,
      sessionMap: new OptionsSessionMap(),
      castLogPanelDeps: makeFakeCastLogPanelDeps(),
    });

    const spellsPanel = (popup as any).panels[0];
    expect(typeof spellsPanel.setHasOverride).toBe('function');

    // After onOpen(), refreshOverrides() renders with the predicate → delegates to overrides.has()
    const hasSpy = vi.spyOn(stubOverrides, 'has').mockReturnValue(true);
    popup.onOpen();
    spellsPanel.refreshOverrides();
    expect(hasSpy).toHaveBeenCalled();
  });
});

