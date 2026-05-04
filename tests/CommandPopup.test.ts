import { describe, it, expect, vi } from 'vitest';
// obsidian is aliased to tests/__mocks__/obsidian.ts in vitest.config.ts
import { CommandPopup } from '../src/ui/CommandPopup';
import * as FSDModule from '../src/ui/components/ForgeSentinelDetail';

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
    const popup = new CommandPopup({} as any);
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
    const popup = new CommandPopup({} as any);
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
    const popup = new CommandPopup({} as any);
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    const countAfterOpen = scope.register.mock.calls.length;

    let capturedOnBack: (() => void) | undefined;
    const OrigFSD = FSDModule.ForgeSentinelDetail;
    vi.spyOn(FSDModule, 'ForgeSentinelDetail' as any).mockImplementationOnce(
      function (_el: any, _scope: any, callbacks: any) {
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

  it('suspends keyboard bindings when entering spell detail', () => {
    const popup = new CommandPopup({} as any);
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    scope.unregister.mockClear();

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('detail', { name: 'My Spell', description: '', tags: [], kind: 'spell' });

    expect(scope.unregister).toHaveBeenCalled();
  });

  it('resumes keyboard bindings when spell detail back button fires', () => {
    const popup = new CommandPopup({} as any);
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    const countAfterOpen = scope.register.mock.calls.length;

    const spellsPanel = (popup as any).panels[0];

    // Capture onClickEvent handler from the back button created in renderDetail
    let capturedOnClick: (() => void) | undefined;
    const contentEl = (popup as any).contentEl;
    const origCreateEl = contentEl.createEl.bind(contentEl);
    contentEl.createEl = vi.fn().mockImplementation((tag: string, opts: any) => {
      const el = origCreateEl(tag, opts);
      if (tag === 'button') {
        el.onClickEvent = vi.fn((cb: () => void) => { capturedOnClick = cb; });
      }
      return el;
    });

    spellsPanel.events.emit('detail', { name: 'My Spell', description: '', tags: [], kind: 'spell' });

    expect(capturedOnClick).toBeDefined();
    capturedOnClick!();

    expect(scope.register.mock.calls.length).toBeGreaterThan(countAfterOpen);
  });

  it('resumes keyboard bindings when forge sentinel onSubmit fires', () => {
    const popup = new CommandPopup({} as any);
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    const countAfterOpen = scope.register.mock.calls.length;

    let capturedOnSubmit: ((...args: any[]) => void) | undefined;
    const OrigFSD = FSDModule.ForgeSentinelDetail;
    vi.spyOn(FSDModule, 'ForgeSentinelDetail' as any).mockImplementationOnce(
      function (_el: any, _scope: any, callbacks: any) {
        capturedOnSubmit = callbacks.onSubmit;
        return Object.assign(Object.create(OrigFSD.prototype), { destroy: vi.fn() });
      } as any
    );

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('sentinel', { kind: 'forge', name: 'My Forge' });

    expect(capturedOnSubmit).toBeDefined();
    capturedOnSubmit!();

    expect(scope.register.mock.calls.length).toBeGreaterThan(countAfterOpen);
  });

  it('restores selected index when returning from spell detail', () => {
    const popup = new CommandPopup({} as any);
    const { dispatch } = installFakeScope(popup as any);
    popup.onOpen();

    const spellsPanel = (popup as any).panels[0];
    const updateSpy = vi.spyOn(spellsPanel, 'updateSelection').mockImplementation(() => {});

    // Navigate to index 2
    dispatch('ArrowDown');
    dispatch('ArrowDown');
    updateSpy.mockClear();

    // Enter spell detail
    spellsPanel.events.emit('detail', { name: 'Summoning Circle', path: '/spells/summoning' });
    updateSpy.mockClear();

    // Return from detail (Obsidian's Escape path)
    popup.close();

    // Selection should be visually restored to index 2 (not 0)
    expect(updateSpy).toHaveBeenCalledWith(0, 2);
  });
});

