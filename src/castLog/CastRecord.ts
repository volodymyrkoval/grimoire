import type { Effort } from '../domain/settings/Settings';

/** Status of a cast: lifecycle from initiation through terminal states (done or error). */
export type CastStatus = 'casted' | 'in-progress' | 'done' | 'error';

/**
 * Folded cast log record combining metadata and events across its lifecycle.
 * Created by foldEvents from one or more CastLogEvent objects (casted → optional in-progress → optional done/error).
 * Status progresses monotonically; optional fields are populated only when their respective events occur.
 */
export interface CastRecord {
  readonly castId: string;
  readonly status: CastStatus;
  readonly spellPath: string;
  readonly model: string;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;
  readonly executeOnNote?: boolean;
  readonly affectedFiles?: readonly string[];
  readonly castedTs: string;
  readonly startedTs?: string;
  readonly endedTs?: string;
  readonly errorMessage?: string;
  readonly portalCastId?: string;
}
