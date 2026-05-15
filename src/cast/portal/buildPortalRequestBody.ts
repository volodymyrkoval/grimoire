import type { Effort } from '../../domain/settings/Settings';

/**
 * Input fields for constructing a portal cast request body.
 *
 * `spellPath` is optional: inline casts (e.g. the Forge meta-spell) have no
 * backing spell file and are driven entirely by `userPrompt`. The portal
 * treats `spellPath` as a file lookup key — sending a UI sentinel like
 * '<forge>' would cause a 404 server-side.
 */
export interface BuildPortalRequestBodyInput {
  castId: string;
  spellPath?: string;
  userPrompt: string;
  modelId: string;
  effort: Effort | null;
}

/**
 * Serialize a cast request into JSON body format for the portal HTTP endpoint.
 * Omits `spellPath` from the body when not provided (inline cast).
 */
export function buildPortalRequestBody(input: BuildPortalRequestBodyInput): string {
  const body: Record<string, unknown> = {
    castId: input.castId,
    userPrompt: input.userPrompt,
    model: input.modelId,
    effort: input.effort,
  };

  if (input.spellPath !== undefined) {
    body.spellPath = input.spellPath;
  }

  return JSON.stringify(body);
}
