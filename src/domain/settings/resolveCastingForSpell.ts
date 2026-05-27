import type { ModelId } from './ModelId';
import type { Effort, SupportedModel } from './Settings';
import type { SpellCastingSettings } from './CastingSettings';

/**
 * Input parameters for resolving casting settings for a spell.
 */
export interface ResolveCastingInput {
  parsed: SpellCastingSettings | null; // from frontmatter, may be null
  defaults: { defaultModel: ModelId; defaultEffort: Effort | null };
  models: readonly SupportedModel[];
  knownProvider: string; // CLAUDE_CODE_PROVIDER today
}

/**
 * Resolved casting settings for a spell.
 */
export interface ResolvedCasting {
  model: ModelId;
  effort: Effort | null;
}

/**
 * Determines whether to fall back wholesale to defaults.
 * True iff parsed is null OR provider doesn't match knownProvider.
 */
function shouldFallbackWholesale(
  parsed: SpellCastingSettings | null,
  knownProvider: string
): boolean {
  if (parsed === null) {
    return true;
  }
  return parsed.provider !== knownProvider;
}

/**
 * Resolves the model from parsed settings or defaults, with deprecation fallback.
 * When wholesale: returns defaults.defaultModel (clamped via model lookup).
 * When not wholesale: returns parsed.model, clamped to supported list.
 */
function resolveModel(
  parsed: SpellCastingSettings | null,
  defaults: { defaultModel: ModelId },
  models: readonly SupportedModel[],
  wholesale: boolean
): SupportedModel {
  const candidate = wholesale ? defaults.defaultModel : parsed!.model;
  const model = models.find((m) => m.id === candidate);
  // Model deprecation — stored id no longer in the supported list; fall back to first supported model.
  return model || models[0];
}

/**
 * Resolves effort from parsed settings or defaults, clamped to the resolved model's capabilities.
 * When wholesale: uses defaults.defaultEffort clamped to the model.
 * When not wholesale: uses parsed.effort if valid, else clamped to the model.
 *
 * Effort-clamping survival rule: if the model's effortOptions is non-null AND the candidate
 * effort is in that array → use it; else → use model's defaultEffort.
 */
function resolveEffort(
  parsed: SpellCastingSettings | null,
  defaults: { defaultEffort: Effort | null },
  resolvedModel: SupportedModel,
  wholesale: boolean
): Effort | null {
  const candidate = wholesale ? defaults.defaultEffort : parsed?.effort;

  // If model doesn't support effort, return null.
  if (resolvedModel.effortOptions === null) {
    return null;
  }

  // If candidate effort is valid for this model, use it.
  if (candidate !== null && candidate !== undefined && resolvedModel.effortOptions.includes(candidate)) {
    return candidate;
  }

  // Fall back to model's default.
  return resolvedModel.defaultEffort;
}

/**
 * Resolves spell-local casting settings, with a three-tier fallback strategy:
 * 1. If parsed is null or provider is stale, use defaults wholesale.
 * 2. Otherwise, use parsed model and effort, clamped to the resolved model's supported range.
 */
export function resolveCastingForSpell(input: ResolveCastingInput): ResolvedCasting {
  const wholesale = shouldFallbackWholesale(input.parsed, input.knownProvider);
  const resolvedModel = resolveModel(input.parsed, input.defaults, input.models, wholesale);
  const resolvedEffort = resolveEffort(input.parsed, input.defaults, resolvedModel, wholesale);

  return {
    model: resolvedModel.id,
    effort: resolvedEffort,
  };
}
