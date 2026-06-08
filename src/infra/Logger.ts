/** Minimal console surface the Logger depends on. Injectable for tests. */
export interface LogSink {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export interface LoggerDeps {
  /** Live predicate read on every debug() call. Closure over settings.debugLogging. */
  isDebugEnabled: () => boolean;
  /** Defaults to console (browser or Node). Inject a fake in tests. */
  sink?: LogSink;
}

export class Logger {
  #isDebugEnabled: () => boolean;
  #sink: LogSink;

  constructor(deps: LoggerDeps) {
    this.#isDebugEnabled = deps.isDebugEnabled;
    this.#sink = deps.sink ?? console;
  }

  error(...args: unknown[]): void {
    this.#sink.error(...args);
  }

  warn(...args: unknown[]): void {
    this.#sink.warn(...args);
  }

  debug(...args: unknown[]): void {
    if (this.#isDebugEnabled()) {
      this.#sink.debug(...args);
    }
  }
}
