import { describe, it, expect, vi } from 'vitest';
// obsidian is aliased to tests/__mocks__/obsidian.ts in vitest.config.ts
import { CommandPopup } from '../src/ui/CommandPopup';
import * as FSDModule from '../src/ui/components/ForgeSentinelDetail';

describe('CommandPopup keyboard suspend/resume', () => {
  it('suspends keyboard bindings when entering forge sentinel detail', () => {
    const popup = new CommandPopup({} as any);
    const scope = (popup as any).scope as { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

    popup.onOpen();
    expect(scope.register.mock.calls.length).toBeGreaterThanOrEqual(5);

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
        return Object.create(OrigFSD.prototype);
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
        return Object.create(OrigFSD.prototype);
      } as any
    );

    const spellsPanel = (popup as any).panels[0];
    spellsPanel.events.emit('sentinel', { kind: 'forge', name: 'My Forge' });

    expect(capturedOnSubmit).toBeDefined();
    capturedOnSubmit!();

    expect(scope.register.mock.calls.length).toBeGreaterThan(countAfterOpen);
  });
});
