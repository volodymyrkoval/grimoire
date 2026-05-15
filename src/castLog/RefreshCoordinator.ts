/**
 * Coordinates detection of cast log changes via event subscription or polling.
 * Implementations may use Obsidian's vault.on('modify') or fallback polling depending on file location.
 */
export interface RefreshCoordinator {
  /**
   * Starts monitoring for changes, invoking the callback when detected.
   */
  start(onRefresh: () => void): void;
  /**
   * Stops monitoring and cleans up timers/event listeners.
   */
  stop(): void;
}
