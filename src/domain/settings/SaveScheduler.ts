/** Port: schedules a settings-save operation. Implemented by infrastructure adapters. */
export interface SaveScheduler {
  /**
   * Schedule an async save operation. Multiple calls may be coalesced
   * (e.g., debounced) by the implementation.
   */
  schedule(): void;

  /**
   * Flush any pending save immediately. Optional—some implementations
   * (e.g., eager savers) may not need this.
   */
  flush?(): void | Promise<void>;
}
