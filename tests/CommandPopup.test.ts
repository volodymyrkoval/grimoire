import { describe, it, expect, vi } from 'vitest';
import type { FormDefaults } from '../src/ui/CommandPopup';
// obsidian is aliased to tests/__mocks__/obsidian.ts in vitest.config.ts
import { App } from 'obsidian';
import { CommandPopup } from '../src/ui/CommandPopup';
import * as FSDModule from '../src/ui/components/ForgeSentinelDetail';

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
    const popup = new CommandPopup(makeApp(), 'spell', vi.fn(), vi.fn(), { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults);
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
    const popup = new CommandPopup(makeApp(), 'spell', vi.fn(), vi.fn(), { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults);
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
    const popup = new CommandPopup(makeApp(), 'spell', vi.fn(), vi.fn(), { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults);
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    const countAfterOpen = scope.register.mock.calls.length;

    let capturedOnBack: (() => void) | undefined;
    const OrigFSD = FSDModule.ForgeSentinelDetail;
    vi.spyOn(FSDModule, 'ForgeSentinelDetail' as any).mockImplementationOnce(
      function (_el: any, _scope: any, callbacks: any, _defaults?: any) {
        capturedOnBack = callbacks.onBack;
        return Object.assign(Object.create(OrigFSD.prototype), { destroy: vi.fn() });
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
    const popup = new CommandPopup(makeApp(), 'spell', vi.fn(), vi.fn(), { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' } satisfies FormDefaults);
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    const countAfterOpen = scope.register.mock.calls.length;

    let capturedOnSubmit: ((...args: any[]) => void) | undefined;
    const OrigFSD = FSDModule.ForgeSentinelDetail;
    vi.spyOn(FSDModule, 'ForgeSentinelDetail' as any).mockImplementationOnce(
      function (_el: any, _scope: any, callbacks: any, _defaults?: any) {
        capturedOnSubmit = callbacks.onSubmit;
        return Object.assign(Object.create(OrigFSD.prototype), { destroy: vi.fn() });
      } as any
    );

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('sentinel', { kind: 'forge', name: 'My Forge' });

    expect(capturedOnSubmit).toBeDefined();
    capturedOnSubmit!({ name: '', description: '', model: 'sonnet', effort: null });

    expect(scope.register.mock.calls.length).toBeGreaterThan(countAfterOpen);
  });

});

