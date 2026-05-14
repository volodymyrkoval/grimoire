import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IntervalTickCoordinator } from '../../src/castLog/IntervalTickCoordinator';

describe('IntervalTickCoordinator', () => {
  it('(a) start(cb) calls cb on every interval', () => {
    const calls: number[] = [];
    let capturedHandle: number | null = null;

    const fakeSetInterval = (cb: () => void, ms: number) => {
      const handle = 1; // dummy handle
      // Simulate 3 ticks
      for (let i = 0; i < 3; i++) {
        calls.push(i);
        cb();
      }
      return handle;
    };

    const fakeClearInterval = () => {};

    const coordinator = new IntervalTickCoordinator({
      intervalMs: 100,
      setInterval: fakeSetInterval as any,
      clearInterval: fakeClearInterval as any,
    });

    const onTick = () => {};
    coordinator.start(onTick);

    expect(calls.length).toBe(3);
  });

  it('(b) stop() clears the interval', () => {
    let clearedHandle: number | null = null;
    let startedHandle: number | null = null;

    const fakeSetInterval = (cb: () => void, ms: number) => {
      startedHandle = 42;
      return startedHandle;
    };

    const fakeClearInterval = (handle: number) => {
      clearedHandle = handle;
    };

    const coordinator = new IntervalTickCoordinator({
      intervalMs: 100,
      setInterval: fakeSetInterval as any,
      clearInterval: fakeClearInterval as any,
    });

    coordinator.start(() => {});
    coordinator.stop();

    expect(clearedHandle).toBe(42);
  });

  it('(c) calling start twice without stop throws error', () => {
    const fakeSetInterval = (cb: () => void, ms: number) => 1;
    const fakeClearInterval = () => {};

    const coordinator = new IntervalTickCoordinator({
      intervalMs: 100,
      setInterval: fakeSetInterval as any,
      clearInterval: fakeClearInterval as any,
    });

    coordinator.start(() => {});

    expect(() => {
      coordinator.start(() => {});
    }).toThrow('TickCoordinator already started');
  });

  it('(d) callback that throws does not stop the interval', () => {
    const calls: number[] = [];

    const fakeSetInterval = (cb: () => void, ms: number) => {
      try {
        cb(); // tick 1 - throws
      } catch {}
      try {
        cb(); // tick 2 - should still run
      } catch {}
      return 1;
    };

    const fakeClearInterval = () => {};

    const coordinator = new IntervalTickCoordinator({
      intervalMs: 100,
      setInterval: fakeSetInterval as any,
      clearInterval: fakeClearInterval as any,
    });

    const onTick = () => {
      calls.push(1);
      throw new Error('callback failed');
    };

    coordinator.start(onTick);

    // Both ticks should have been attempted
    expect(calls.length).toBe(2);
  });

  it('(e) stop() before start is a no-op (no throw)', () => {
    const fakeSetInterval = (cb: () => void, ms: number) => 1;
    const fakeClearInterval = () => {};

    const coordinator = new IntervalTickCoordinator({
      intervalMs: 100,
      setInterval: fakeSetInterval as any,
      clearInterval: fakeClearInterval as any,
    });

    expect(() => {
      coordinator.stop();
    }).not.toThrow();
  });

  it('(f) stop() is idempotent (calling twice is fine)', () => {
    const fakeSetInterval = (cb: () => void, ms: number) => 1;
    const fakeClearInterval = () => {};

    const coordinator = new IntervalTickCoordinator({
      intervalMs: 100,
      setInterval: fakeSetInterval as any,
      clearInterval: fakeClearInterval as any,
    });

    coordinator.start(() => {});

    expect(() => {
      coordinator.stop();
      coordinator.stop();
    }).not.toThrow();
  });
});
