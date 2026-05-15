/**
 * Manages periodic callbacks for time-based tasks (sweeping, refresh checks).
 * Implementations may use setInterval or custom polling strategies.
 */
export interface TickCoordinator {
  /**
   * Starts the ticker, invoking the callback at periodic intervals.
   */
  start(onTick: () => void): void;
  /**
   * Stops the ticker and cleans up any timers.
   */
  stop(): void;
}
