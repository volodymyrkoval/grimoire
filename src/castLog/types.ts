import type { Effort } from '../domain/settings/Settings';

export type CastLogStage = 'casted' | 'error' | 'in-progress' | 'done';

export interface BaseEvent {
  readonly castId: string;
  readonly ts: string;
}

export interface CastedEvent extends BaseEvent {
  readonly stage: 'casted';
  readonly spellPath: string;
  readonly model: string;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;
  readonly executeOnNote?: boolean;
}

export interface ErrorEvent extends BaseEvent {
  readonly stage: 'error';
  readonly message: string;
}

export interface InProgressEvent extends BaseEvent {
  readonly stage: 'in-progress';
}

export interface DoneEvent extends BaseEvent {
  readonly stage: 'done';
  readonly affectedFiles?: readonly string[];
}

export type CastLogEvent = CastedEvent | ErrorEvent | InProgressEvent | DoneEvent;

export const FORGE_SPELL_PATH = '<forge>' as const;
