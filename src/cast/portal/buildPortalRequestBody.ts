import type { Effort } from '../../domain/settings/Settings';

export interface BuildPortalRequestBodyInput {
  castId: string;
  spellPath: string;
  userPrompt: string;
  modelId: string;
  effort: Effort | null;
}

export function buildPortalRequestBody(input: BuildPortalRequestBodyInput): string {
  const body = {
    castId: input.castId,
    spellPath: input.spellPath,
    userPrompt: input.userPrompt,
    model: input.modelId,
    effort: input.effort,
  };

  return JSON.stringify(body);
}
