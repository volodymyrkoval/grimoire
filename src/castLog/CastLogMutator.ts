/**
 * Removes cast log lines from persistent storage.
 * The panel's destructive-action dependency.
 */
export interface CastLogMutator {
  /**
   * Removes every line whose castId matches, across all configured log files.
   * Non-matching and unparseable lines are preserved.
   * Missing files are a no-op.
   */
  deleteCast(castId: string): Promise<void>;

  /**
   * Empties every configured log file.
   * Missing files are a no-op.
   */
  clearAll(): Promise<void>;
}
