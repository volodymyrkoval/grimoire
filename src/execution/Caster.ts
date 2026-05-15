import type { Effort } from '../domain/settings/Settings';

/** Input required to initiate a cast (spell execution). */
export interface CastInput {
  readonly castId: string;
  /** Spell file path — omitted for inline casts such as forge meta-spells. */
  readonly spellPath?: string;
  readonly modelId: string;
  readonly effort: Effort | null;
  readonly userPrompt: string;
  readonly systemPromptFile?: string;
  readonly vaultMountPath: string;
}

/** Info returned when a cast is accepted for execution (e.g., portal job ID). */
export interface CastAcceptedInfo {
  readonly jobId?: string;
}

/** Callbacks fired when a cast is accepted or fails. */
export interface CastCallbacks {
  onAccepted(info: CastAcceptedInfo): void;
  onFailure(message: string): void;
}

/** Abstract interface for spell execution via local or remote backend. */
export interface Caster {
  cast(input: CastInput, callbacks: CastCallbacks): void;
}
