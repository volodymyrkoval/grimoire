import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebouncedSaver } from '../src/infra/DebouncedSaver';

describe('DebouncedSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('(a) schedule() then advance 500ms → save called exactly once', () => {
    const save = vi.fn();
    const saver = new DebouncedSaver(save, 500);

    saver.schedule();
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('(b) schedule() twice within 500ms → save called once after final 500ms (debounce coalesces)', () => {
    const save = vi.fn();
    const saver = new DebouncedSaver(save, 500);

    saver.schedule();
    vi.advanceTimersByTime(250);
    expect(save).not.toHaveBeenCalled();

    saver.schedule();
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('(c) flush() with pending timer → save called immediately without advancing timers', () => {
    const save = vi.fn();
    const saver = new DebouncedSaver(save, 500);

    saver.schedule();
    expect(save).not.toHaveBeenCalled();

    saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('(d) flush() with no pending timer → no-op, save NOT called', () => {
    const save = vi.fn();
    const saver = new DebouncedSaver(save, 500);

    saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('(e) save function throws → error caught, console.error called, NOT rethrown', async () => {
    const error = new Error('save failed');
    const save = vi.fn().mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const saver = new DebouncedSaver(save, 500);
    saver.schedule();

    vi.advanceTimersByTime(500);
    // Flush all timers and microtasks to let the promise chain settle
    await vi.runAllTimersAsync();

    expect(save).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(error);

    consoleError.mockRestore();
  });
});
