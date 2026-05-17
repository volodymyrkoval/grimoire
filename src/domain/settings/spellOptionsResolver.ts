import { SpellPath } from '../../domain/spells/SpellPath';
import { SpellOverrideStore } from './SpellOverrideStore';
import { Effort, SupportedModel } from './Settings';
import type { ModelId } from './ModelId';

/** Model and effort selected for a spell within the current session. */
export interface SpellSessionEntry {
  model: ModelId;
  effort: Effort | null;
}

/** Read-only view of per-spell session data. */
export interface SpellSessionReader {
  get(path: SpellPath): SpellSessionEntry | undefined;
}

/** Input to the spell options resolution cascade. */
export interface ResolveOptionsInput {
  spellPath: SpellPath;
  session: SpellSessionReader;
  overrides: SpellOverrideStore;
  settings: { defaultModel: ModelId; defaultEffort: Effort | null };
  models: readonly SupportedModel[];
}

/** Final resolved model and effort for a cast, guaranteed to be valid for the model. */
export interface ResolvedSpellOptions {
  model: ModelId;
  effort: Effort | null;
}

/**
 * Resolves model and effort through a three-tier cascade: session → overrides → settings.
 * Clamps effort to the selected model's supported range, falling back to the model's default if needed.
 */
export function resolveSpellOptions(input: ResolveOptionsInput): ResolvedSpellOptions {
  let selectedModel: ModelId;
  let selectedEffort: Effort | null;

  // Tier 1: check session
  const sessionEntry = input.session.get(input.spellPath);
  if (sessionEntry) {
    selectedModel = sessionEntry.model;
    selectedEffort = sessionEntry.effort;
  } else {
    // Tier 2: check overrides
    const override = input.overrides.get(input.spellPath);
    if (override) {
      selectedModel = override.model;
      selectedEffort = override.effort;
    } else {
      // Tier 3: use settings defaults
      selectedModel = input.settings.defaultModel;
      selectedEffort = input.settings.defaultEffort;
    }
  }

  // Apply effort-clamping survival rule
  const model = input.models.find((m) => m.id === selectedModel);
  // Model deprecation — stored id no longer in the supported list; fall back to first supported model.
  const resolvedModel = model || input.models[0];

  let resolvedEffort: Effort | null;
  if (resolvedModel.effortOptions !== null && selectedEffort !== null && resolvedModel.effortOptions.includes(selectedEffort)) {
    resolvedEffort = selectedEffort;
  } else {
    resolvedEffort = resolvedModel.defaultEffort;
  }

  return {
    model: resolvedModel.id,
    effort: resolvedEffort,
  };
}
