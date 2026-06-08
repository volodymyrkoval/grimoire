import { describe, it, expect, vi } from 'vitest';
import { Logger, LogSink } from '../src/infra/Logger';

describe('Logger', () => {
  it('(a) error() forwards all args to sink.error unconditionally', () => {
    const sink: LogSink = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const logger = new Logger({ isDebugEnabled: () => false, sink });

    logger.error('msg', { data: 'value' });

    expect(sink.error).toHaveBeenCalledWith('msg', { data: 'value' });
  });

  it('(b) warn() forwards all args to sink.warn unconditionally', () => {
    const sink: LogSink = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const logger = new Logger({ isDebugEnabled: () => false, sink });

    logger.warn('alert', 123);

    expect(sink.warn).toHaveBeenCalledWith('alert', 123);
  });

  it('(c) debug() forwards to sink.debug only when isDebugEnabled() is true', () => {
    const sink: LogSink = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const logger = new Logger({ isDebugEnabled: () => true, sink });

    logger.debug('trace', { x: 1 });

    expect(sink.debug).toHaveBeenCalledWith('trace', { x: 1 });
  });

  it('(d) debug() does NOT forward to sink.debug when isDebugEnabled() is false', () => {
    const sink: LogSink = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const logger = new Logger({ isDebugEnabled: () => false, sink });

    logger.debug('trace', { x: 1 });

    expect(sink.debug).not.toHaveBeenCalled();
  });

  it('(e) debug() is live — gated on each call, not evaluated at constructor time', () => {
    const sink: LogSink = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    let debugEnabled = true;
    const logger = new Logger({
      isDebugEnabled: () => debugEnabled,
      sink,
    });

    logger.debug('first');
    expect(sink.debug).toHaveBeenCalledTimes(1);

    debugEnabled = false;
    logger.debug('second');
    expect(sink.debug).toHaveBeenCalledTimes(1); // unchanged

    debugEnabled = true;
    logger.debug('third');
    expect(sink.debug).toHaveBeenCalledTimes(2);
  });

  it('(f) constructor defaults sink to globalThis.console when sink is not provided', () => {
    const logger = new Logger({ isDebugEnabled: () => false });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('test error');
    expect(consoleSpy).toHaveBeenCalledWith('test error');
    consoleSpy.mockRestore();
  });
});
