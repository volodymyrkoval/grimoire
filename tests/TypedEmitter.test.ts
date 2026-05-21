import { describe, it, expect, vi } from 'vitest';
import { TypedEmitter } from '../src/infra/TypedEmitter';

type TestEvents = { ping: string; pong: number };

describe('TypedEmitter.off()', () => {
  it('off() prevents a removed listener from firing on subsequent emit', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();
    emitter.on('ping', listener);
    emitter.off('ping', listener);

    emitter.emit('ping', 'hello');

    expect(listener).not.toHaveBeenCalled();
  });

  it('off() only removes the specified listener; other listeners for the same event still fire', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    emitter.on('ping', listenerA);
    emitter.on('ping', listenerB);
    emitter.off('ping', listenerA);

    emitter.emit('ping', 'hello');

    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledOnce();
  });

  it('off() on a listener that was never registered is a no-op (does not throw)', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    expect(() => emitter.off('ping', listener)).not.toThrow();
  });
});
