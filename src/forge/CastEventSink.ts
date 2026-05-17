import type { Effort } from '../domain/settings/Settings';
import type { ModelId } from '../domain/settings/ModelId';

/**
 * Input for recording a cast event; stage and timestamp are added automatically.
 * Intentionally re-declared here (not imported from castLog/) so forge/ owns its port interface.
 */
export interface RecordCastedInput {
  readonly castId: string;
  readonly spellPath: string;
  readonly model: ModelId;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;
  readonly executeOnNote?: boolean;
  readonly portalCastId?: string;
}

/**
 * Input for recording an error event; stage and timestamp are added automatically.
 * Intentionally re-declared here (not imported from castLog/) so forge/ owns its port interface.
 */
export interface RecordErrorInput {
  readonly castId: string;
  readonly message: string;
}

/**
 * Port: records cast initiation and error events.
 * forge/ owns this port; implementations live in castLog/ or elsewhere.
 */
export interface CastEventSink {
  recordCasted(input: RecordCastedInput): Promise<void>;
  recordError(input: RecordErrorInput): Promise<void>;
}
