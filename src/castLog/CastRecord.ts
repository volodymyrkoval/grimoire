import type { Effort } from '../domain/settings/Settings';

export type CastStatus = 'casted' | 'in-progress' | 'done' | 'error';

export interface CastRecord {
  readonly castId: string;
  readonly status: CastStatus;
  readonly spellPath: string;        // "<forge>" sentinel for forge casts
  readonly model: string;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;
  readonly executeOnNote?: boolean;  // present only for live casts
  readonly affectedFiles?: readonly string[];
  readonly castedTs: string;         // ISO — always present
  readonly startedTs?: string;       // ISO — from in-progress event
  readonly endedTs?: string;         // ISO — from done/error event
  readonly errorMessage?: string;
  readonly portalCastId?: string;
}
