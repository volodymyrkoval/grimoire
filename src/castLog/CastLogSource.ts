import type { CastLogReader } from './CastLogReader';
import type { CastRecord } from './CastRecord';
import type { CastLogEvent } from './types';

/**
 * Loads and folds cast log events into a structured record set.
 * Reads all events from storage and combines related event sequences (casted → in-progress → done/error)
 * into individual CastRecord objects for display and analysis.
 */
export class CastLogSource {
  constructor(
    private readonly deps: {
      reader: CastLogReader;
      foldEvents: (events: CastLogEvent[]) => CastRecord[];
    }
  ) {}

  /**
   * Loads all cast events and folds them into records, returning most recent first.
   */
  async load(): Promise<CastRecord[]> {
    const events = await this.deps.reader.readAll();
    return this.deps.foldEvents(events);
  }
}
