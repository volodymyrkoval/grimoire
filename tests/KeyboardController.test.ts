import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyboardController } from '../src/ui/KeyboardController';

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
