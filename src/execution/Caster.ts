import type { Effort } from '../domain/settings/Settings';

export interface CastInput {
  readonly castId: string;
  readonly spellPath: string;
  readonly modelId: string;
  readonly effort: Effort | null;
  readonly userPrompt: string;
  readonly systemPromptFile?: string;
  readonly vaultMountPath: string;
}

export interface CastAcceptedInfo {
  readonly jobId?: string;
}

export interface CastCallbacks {
  onAccepted(info: CastAcceptedInfo): void;
  onFailure(message: string): void;
}

export interface Caster {
  cast(input: CastInput, callbacks: CastCallbacks): void;
}
