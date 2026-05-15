import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyboardController } from '../src/infra/KeyboardController';

const makeScope = () => {
  const handlers: Map<string, Function> = new Map();
  return {
    register: vi.fn((modifiers: string[], key: string, cb: Function) => {
      const handle = { modifiers, key, cb };
      return handle;
    }),
    unregister: vi.fn(),
  };
};

describe('KeyboardController', () => {
  it('unbindAll() clears specs so resume() has nothing to re-register', () => {
    const scope = makeScope();
    const kb = new KeyboardController(scope as any);

    kb.bind([], 'ArrowDown', () => true);
    kb.unbindAll();
    expect(scope.unregister).toHaveBeenCalledTimes(1);

    kb.resume();

    // register was called once (original bind); after unbindAll+resume it should not grow
    expect(scope.register).toHaveBeenCalledTimes(1);
  });

  it('resume() re-registers all bindings from stored specs', () => {
    const scope = makeScope();
    const kb = new KeyboardController(scope as any);

    kb.bind([], 'ArrowDown', () => true);
    kb.bind([], 'ArrowUp', () => true);
    kb.suspend();
    expect(scope.register).toHaveBeenCalledTimes(2);

    kb.resume();

    expect(scope.register).toHaveBeenCalledTimes(4); // 2 original + 2 re-registered
  });

  it('suspend() unregisters all active handlers', () => {
    const scope = makeScope();
    const kb = new KeyboardController(scope as any);

    kb.bind([], 'ArrowDown', () => true);
    kb.bind([], 'ArrowUp', () => true);
    expect(scope.register).toHaveBeenCalledTimes(2);

    kb.suspend();

    expect(scope.unregister).toHaveBeenCalledTimes(2);
  });
});
