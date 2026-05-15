import type { CastLogEvent } from './types';

/**
 * Reads cast log events from persistent storage.
 * Implementations may read from local files, remote logs, or both.
 */
export interface CastLogReader {
  /**
   * Reads all cast log events, returning most recent first.
   */
  readAll(): Promise<CastLogEvent[]>;
}
