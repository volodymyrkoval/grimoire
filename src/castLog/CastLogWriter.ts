import type { CastedEvent, ErrorEvent } from './types';

export type RecordCastedInput = Omit<CastedEvent, 'stage' | 'ts'>;
export type RecordErrorInput = Omit<ErrorEvent, 'stage' | 'ts'>;

export interface CastLogWriter {
  recordCasted(input: RecordCastedInput): Promise<void>;
  recordError(input: RecordErrorInput): Promise<void>;
}
