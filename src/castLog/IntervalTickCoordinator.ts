import { TickCoordinator } from './TickCoordinator';

interface IntervalTickCoordinatorOptions {
  intervalMs: number;
  setInterval?: typeof activeWindow.setInterval;
  clearInterval?: typeof activeWindow.clearInterval;
}

/**
 * Implements TickCoordinator using setInterval.
 * Periodically invokes a callback at fixed intervals, swallowing any errors to keep the interval alive.
 */
export class IntervalTickCoordinator implements TickCoordinator {
  #intervalMs: number;
  #setInterval: typeof activeWindow.setInterval;
  #clearInterval: typeof activeWindow.clearInterval;
  #handle: ReturnType<typeof activeWindow.setInterval> | null = null;

  constructor(options: IntervalTickCoordinatorOptions) {
    this.#intervalMs = options.intervalMs;
    this.#setInterval = (options.setInterval ?? activeWindow.setInterval.bind(activeWindow)) as typeof activeWindow.setInterval;
    this.#clearInterval = (options.clearInterval ?? activeWindow.clearInterval.bind(activeWindow)) as typeof activeWindow.clearInterval;
  }

  start(onTick: () => void): void {
    if (this.#handle !== null) {
      throw new Error('TickCoordinator already started');
    }

    this.#handle = this.#setInterval(() => {
      try {
        onTick();
      } catch {
        // Callback error must not break the interval.
      }
    }, this.#intervalMs);
  }

  stop(): void {
    if (this.#handle !== null) {
      this.#clearInterval(this.#handle);
      this.#handle = null;
    }
  }
}
