import type { CastLogEvent } from './types';

export interface CastLogReader {
  readAll(): Promise<CastLogEvent[]>;
}
