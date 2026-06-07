/**
 * Unit tests for HotkeyCapture — S1 fix verification.
 *
 * S1: HotkeyCapture must accept an injected KeyboardController (kb) rather than
 * creating its own from a raw Scope. This ensures that kb.suspend() on the popup's
 * controller automatically tears down the capture's bindings without a separate
 * uninstall() call.
 */

import { describe, it, expect, vi } from 'vitest';
import { HotkeyCapture, type HotkeyCaptureDeps } from '../../../../src/ui/popup/hotkey/HotkeyCapture';
import { KeyboardController } from '../../../../src/infra/KeyboardController';
import { HotkeyBuffer } from '../../../../src/ui/popup/hotkey/HotkeyBuffer';
import { HotkeyRegistry } from '../../../../src/ui/popup/hotkey/HotkeyRegistry';
import { Scope } from 'obsidian';

function makeRegistry(): HotkeyRegistry {
  const { registry } = HotkeyRegistry.build([], [
    { kind: 'forge', name: 'Forge' },
    { kind: 'refine', name: 'Refine' },
  ]);
  return registry;
}

describe('HotkeyCapture — S1: accepts injected KeyboardController', () => {
  it('HotkeyCaptureDeps.kb accepts a KeyboardController instance (not a Scope)', () => {
    const scope = new Scope();
    const kb = new KeyboardController(scope);
    const buffer = new HotkeyBuffer();
    const registry = makeRegistry();

    // S1: the deps shape must accept kb: KeyboardController.
    // This test fails at compile time + runtime when the interface still requires scope: Scope.
    const deps: HotkeyCaptureDeps = {
      kb,
      buffer,
      registry,
      focusRow: vi.fn(),
    };
    const capture = new HotkeyCapture(deps);
    expect(capture).toBeDefined();
  });

  it('install() registers 26 Shift+letter bindings on the injected kb', () => {
    const scope = new Scope();
    const kb = new KeyboardController(scope);
    const bindSpy = vi.spyOn(kb, 'bind');

    const capture = new HotkeyCapture({
      kb,
      buffer: new HotkeyBuffer(),
      registry: makeRegistry(),
      focusRow: vi.fn(),
    });

    capture.install();

    // 26 letters a–z, each bound with ['Shift'] modifier
    expect(bindSpy).toHaveBeenCalledTimes(26);
    expect(bindSpy.mock.calls[0][0]).toEqual(['Shift']);  // modifiers
    expect(bindSpy.mock.calls[0][1]).toBe('a');           // first letter
  });

  it('uninstall() releases only the capture bindings, leaving other bindings on the shared kb intact', () => {
    const scope = new Scope();
    const kb = new KeyboardController(scope);

    // Pre-existing binding that simulates the popup's own nav keys (Tab/Arrow/etc.).
    kb.bind([], 'Tab', () => true);
    const tabRegistration = scope.register.mock.results.at(-1)!.value;

    const capture = new HotkeyCapture({
      kb,
      buffer: new HotkeyBuffer(),
      registry: makeRegistry(),
      focusRow: vi.fn(),
    });

    capture.install();
    capture.uninstall();

    // uninstall() must unregister exactly the 26 capture bindings — never the
    // pre-existing Tab binding, which represents the popup's own nav keys.
    expect(scope.unregister).toHaveBeenCalledTimes(26);
    const unregisteredArgs = scope.unregister.mock.calls.map((c: unknown[]) => c[0]);
    expect(unregisteredArgs).not.toContain(tabRegistration);
  });

  it('suspend() on the injected kb unregisters capture bindings from the scope', () => {
    const scope = new Scope();
    const kb = new KeyboardController(scope);
    const buffer = new HotkeyBuffer();
    const registry = makeRegistry();
    const focusRow = vi.fn();

    const capture = new HotkeyCapture({ kb, buffer, registry, focusRow });
    capture.install();

    // After install: 26 bindings are registered on scope.
    // Each kb.bind() call pushes to scope.register.
    const registeredCountAfterInstall = scope.register.mock.calls.length;
    expect(registeredCountAfterInstall).toBe(26);

    // suspend() must call scope.unregister for each registered handler.
    // The capture uses the same kb as the popup — so popup's kb.suspend()
    // removes capture bindings from the scope automatically.
    kb.suspend();
    expect(scope.unregister).toHaveBeenCalledTimes(26);
  });
});

describe('HotkeyCapture — ignores Shift+letter when editable element is focused', () => {
  it('does not call focusRow and returns true (not consumed) when INPUT is focused', () => {
    const scope = new Scope();
    const kb = new KeyboardController(scope);
    const buffer = new HotkeyBuffer();
    const registry = makeRegistry();
    const focusRow = vi.fn();

    const capture = new HotkeyCapture({
      kb,
      buffer,
      registry,
      focusRow,
      getActiveElement: () => ({ tagName: 'INPUT' } as unknown as Element),
    });
    capture.install();

    const fCall = scope.register.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[0]) && (call[0] as string[]).includes('Shift') && call[1] === 'f',
    );
    expect(fCall, 'Shift+f binding should be registered').toBeDefined();
    const handler = fCall![2] as (e: unknown) => boolean | void;
    const result = handler({ preventDefault: vi.fn() } as unknown);

    expect(focusRow).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('does not call focusRow and returns true (not consumed) when TEXTAREA is focused', () => {
    const scope = new Scope();
    const kb = new KeyboardController(scope);
    const buffer = new HotkeyBuffer();
    const registry = makeRegistry();
    const focusRow = vi.fn();

    const capture = new HotkeyCapture({
      kb,
      buffer,
      registry,
      focusRow,
      getActiveElement: () => ({ tagName: 'TEXTAREA' } as unknown as Element),
    });
    capture.install();

    const fCall = scope.register.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[0]) && (call[0] as string[]).includes('Shift') && call[1] === 'f',
    );
    expect(fCall, 'Shift+f binding should be registered').toBeDefined();
    const handler = fCall![2] as (e: unknown) => boolean | void;
    const result = handler({ preventDefault: vi.fn() } as unknown);

    expect(focusRow).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('does not call focusRow and returns true (not consumed) when SELECT is focused', () => {
    const scope = new Scope();
    const kb = new KeyboardController(scope);
    const buffer = new HotkeyBuffer();
    const registry = makeRegistry();
    const focusRow = vi.fn();

    const capture = new HotkeyCapture({
      kb,
      buffer,
      registry,
      focusRow,
      getActiveElement: () => ({ tagName: 'SELECT' } as unknown as Element),
    });
    capture.install();

    const fCall = scope.register.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[0]) && (call[0] as string[]).includes('Shift') && call[1] === 'f',
    );
    expect(fCall, 'Shift+f binding should be registered').toBeDefined();
    const handler = fCall![2] as (e: unknown) => boolean | void;
    const result = handler({ preventDefault: vi.fn() } as unknown);

    expect(focusRow).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });
});

describe('HotkeyCapture — exact match keeps buffer for visual feedback', () => {
  it('after Shift+f exact match, buffer retains the matched letter with normal status', () => {
    // The exact-match arm previously called buffer.clear() synchronously after
    // focusing the row — the browser never painted the indicator, so the user
    // got no visual confirmation. New contract: keep the letter in the buffer
    // and mark it 'normal' (green). The buffer is cleared by other paths
    // (Escape, arrows, Tab, popup close, × click) — not by the match itself.
    const scope = new Scope();
    const kb = new KeyboardController(scope);
    const buffer = new HotkeyBuffer();
    const registry = makeRegistry();
    const focusRow = vi.fn();

    const capture = new HotkeyCapture({ kb, buffer, registry, focusRow });
    capture.install();

    // Find and invoke the handler that was registered for Shift+f directly,
    // bypassing dispatch() (which relies on KeyboardEvent — not available in
    // the node test environment).
    const fCall = scope.register.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[0]) && (call[0] as string[]).includes('Shift') && call[1] === 'f',
    );
    expect(fCall, 'Shift+f binding should be registered').toBeDefined();
    const handler = fCall![2] as (e: unknown) => boolean | void;
    handler({ preventDefault: vi.fn() } as unknown);

    // focusRow must have been called (exact match fired).
    expect(focusRow).toHaveBeenCalledTimes(1);

    // Buffer must retain 'f' with normal status — NOT be cleared.
    const state = buffer.state();
    expect(state.letters).toBe('f');
    expect(state.status).toBe('normal');
  });
});
