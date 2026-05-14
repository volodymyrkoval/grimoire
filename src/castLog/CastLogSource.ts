import type { CastLogReader } from './CastLogReader';
import type { CastRecord } from './CastRecord';
import type { CastLogEvent } from './types';

export class CastLogSource {
  constructor(
    private readonly deps: {
      reader: CastLogReader;
      foldEvents: (events: CastLogEvent[]) => CastRecord[];
    }
  ) {}

  async load(): Promise<CastRecord[]> {
    const events = await this.deps.reader.readAll();
    return this.deps.foldEvents(events);
  }
}
