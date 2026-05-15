import type { Effort } from '../domain/settings/Settings';

/** Stages a cast passes through during its lifecycle. */
export type CastLogStage = 'casted' | 'error' | 'in-progress' | 'done';

/**
 * Common fields for all cast log events: cast identity and ISO timestamp.
 */
export interface BaseEvent {
  readonly castId: string;
  readonly ts: string;
}

/**
 * Logged when a cast is initiated with spell, model, effort, and context.
 */
export interface CastedEvent extends BaseEvent {
  readonly stage: 'casted';
  readonly spellPath: string;
  readonly model: string;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;
  readonly executeOnNote?: boolean;
  readonly portalCastId?: string;
}

/**
 * Logged when a cast fails with an error message.
 */
export interface ErrorEvent extends BaseEvent {
  readonly stage: 'error';
  readonly message: string;
}

/**
 * Logged when a cast begins execution (session-start hook fires).
 */
export interface InProgressEvent extends BaseEvent {
  readonly stage: 'in-progress';
}

/**
 * Logged when a cast completes successfully with optional list of affected files (stop hook fires).
 */
export interface DoneEvent extends BaseEvent {
  readonly stage: 'done';
  readonly affectedFiles?: readonly string[];
}

/** Union of all cast log event types. */
export type CastLogEvent = CastedEvent | ErrorEvent | InProgressEvent | DoneEvent;

/**
 * Sentinel spell path for casts originating from the Forge (not a live spell).
 */
export const FORGE_SPELL_PATH = '<forge>' as const;
