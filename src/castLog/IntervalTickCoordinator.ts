/* eslint-disable obsidianmd/prefer-active-doc */
import { TickCoordinator } from './TickCoordinator';

interface IntervalTickCoordinatorOptions {
  intervalMs: number;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export class IntervalTickCoordinator implements TickCoordinator {
  private intervalMs: number;
  private setInterval: typeof globalThis.setInterval;
  private clearInterval: typeof globalThis.clearInterval;
  private handle: number | null = null;

  constructor(options: IntervalTickCoordinatorOptions) {
    this.intervalMs = options.intervalMs;
    this.setInterval = options.setInterval || globalThis.setInterval;
    this.clearInterval = options.clearInterval || globalThis.clearInterval;
  }

  start(onTick: () => void): void {
    if (this.handle !== null) {
      throw new Error('TickCoordinator already started');
    }

    this.handle = this.setInterval(() => {
      try {
        onTick();
      } catch {
        // Swallow callback errors; the interval continues
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.handle !== null) {
      this.clearInterval(this.handle);
      this.handle = null;
    }
  }
}
