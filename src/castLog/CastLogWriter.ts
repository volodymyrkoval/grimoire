import type { CastedEvent, ErrorEvent } from './types';

/** Input for recording a cast event; stage and timestamp are added automatically. */
export type RecordCastedInput = Omit<CastedEvent, 'stage' | 'ts'>;
/** Input for recording an error event; stage and timestamp are added automatically. */
export type RecordErrorInput = Omit<ErrorEvent, 'stage' | 'ts'>;

/**
 * Records cast execution events to persistent storage.
 */
export interface CastLogWriter {
  /**
   * Records a cast initiation with metadata: spell path, model, effort, and context.
   */
  recordCasted(input: RecordCastedInput): Promise<void>;
  /**
   * Records a cast failure with error message.
   */
  recordError(input: RecordErrorInput): Promise<void>;
}
