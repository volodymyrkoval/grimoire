import type { Effort } from '../../domain/settings/Settings';

/**
 * Input fields for constructing a portal cast request body.
 */
export interface BuildPortalRequestBodyInput {
  castId: string;
  spellPath: string;
  userPrompt: string;
  modelId: string;
  effort: Effort | null;
}

/**
 * Serialize a cast request into JSON body format for the portal HTTP endpoint.
 */
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
