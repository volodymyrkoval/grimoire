import { Effort, SupportedModel } from "../../domain/settings/Settings";
import type { FormDefaults } from "../../domain/settings/FormDefaults";
import type { ModelId } from "../../domain/settings/ModelId";
import type { Provider } from "../../domain/settings/Provider";
import type { Spell } from "../../domain/spells/Spell";
import { REFINE_SENTINEL_PATH } from "../../domain/spells/Spell";
import { resolveSpellOptions } from "../../domain/settings/spellOptionsResolver";
import type { SpellOverrideStore } from "../../domain/settings/SpellOverrideStore";
import type { OptionsSessionMap } from "./OptionsSessionMap";
import type { Logger } from "../../infra/Logger";

/**
 * Snapshot of all casting options captured at the moment the user submits a cast.
 * Carried through the CastAction/RefineCastAction callback so the dispatcher
 * can forward every field — including `provider` — to CastDispatchInput.
 */
export interface OptionsFormSnapshot {
  model: ModelId;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  executeOnNote: boolean;
  /** Provider selected for this cast. Resolved from frontmatter or defaultProvider. */
  provider: Provider;
  /** Only set for the Refine sentinel. undefined = no choice yet; null = explicit "Default (built-in)". */
  refinePathOverride?: string | null;
}

/**
 * Creates an initial form snapshot from plugin defaults and spell executeOnNote flag.
 * Used to populate OptionsPanel when opening a spell's options for the first time.
 */
export function optionsFormSnapshotFromDefaults(
  defaults: FormDefaults,
  spell: Pick<Spell, "executeOnNote">,
): OptionsFormSnapshot {
  return {
    model: defaults.defaultModel,
    effort: defaults.defaultEffort,
    provider: defaults.defaultProvider,
    contextNotePaths: [],
    followUp: "",
    executeOnNote: spell.executeOnNote,
  };
}

/**
 * Creates an initial form snapshot for the Refine sentinel from defaults, overrides, and session state.
 * Resolves Refine-specific options (model, effort) from overrides and defaults,
 * pulls context notes and follow-up from the session map, and forces executeOnNote to true.
 * Also restores `refinePathOverride` from the session entry when present.
 */
export function optionsFormSnapshotFromRefineDefaults(
  defaults: FormDefaults,
  overrides: SpellOverrideStore,
  sessionMap: OptionsSessionMap,
  models: readonly SupportedModel[],
): OptionsFormSnapshot {
  const resolved = resolveSpellOptions({
    spellPath: REFINE_SENTINEL_PATH,
    session: sessionMap,
    overrides,
    settings: {
      defaultModel: defaults.defaultModel,
      defaultEffort: defaults.defaultEffort,
    },
    models,
  });

  const sessionEntry = sessionMap.get(REFINE_SENTINEL_PATH);

  return {
    model: resolved.model,
    effort: resolved.effort,
    provider: defaults.defaultProvider,
    contextNotePaths: sessionEntry?.contextNotePaths ?? [],
    followUp: sessionEntry?.followUp ?? '',
    executeOnNote: true,
    refinePathOverride: sessionEntry?.refinePathOverride,
  };
}

/**
 * Reactive form state for casting options (model, effort, context notes, follow-up, executeOnNote).
 * Implements reactive pattern: listeners are notified on any change via onChange.
 * setModel applies effort survival rule: current effort persists if valid for new model.
 */
export class OptionsFormState {
  readonly #logger: Logger | undefined;
  #model: ModelId;
  #effort: Effort | null;
  #provider: Provider;
  #contextNotePaths: readonly string[];
  #followUp: string;
  #executeOnNote: boolean;
  #listeners: Set<() => void>;

  constructor(initial: OptionsFormSnapshot, logger?: Logger) {
    this.#logger = logger;
    this.#model = initial.model;
    this.#effort = initial.effort;
    this.#provider = initial.provider;
    this.#contextNotePaths = initial.contextNotePaths;
    this.#followUp = initial.followUp;
    this.#executeOnNote = initial.executeOnNote;
    this.#listeners = new Set();
  }

  setModel(modelId: ModelId, models: readonly SupportedModel[]): Effort | null {
    // Find the model; fall back to models[0] if not found
    let resolvedModel = models.find((m) => m.id === modelId);
    if (!resolvedModel) {
      this.#logger?.warn(`Model ${modelId} not found in SUPPORTED_MODELS, falling back to ${models[0].id}`);
      resolvedModel = models[0];
    }

    // Apply effort survival rule
    const effortOptions = resolvedModel.effortOptions;
    let resolvedEffort: Effort | null;

    if (effortOptions !== null && this.#effort !== null && effortOptions.includes(this.#effort)) {
      // Survival: current effort is still valid for the new model
      resolvedEffort = this.#effort;
    } else {
      // Fallback: use the model's default (which may be null for Haiku)
      resolvedEffort = resolvedModel.defaultEffort;
    }

    this.#model = resolvedModel.id;
    this.#effort = resolvedEffort;
    this.#emit();
    return resolvedEffort;
  }

  setEffort(effort: Effort): void {
    this.#effort = effort;
    this.#emit();
  }

  setContextNotePaths(paths: readonly string[]): void {
    this.#contextNotePaths = paths;
    this.#emit();
  }

  setFollowUp(text: string): void {
    this.#followUp = text;
    this.#emit();
  }

  setExecuteOnNote(value: boolean): void {
    this.#executeOnNote = value;
    this.#emit();
  }

  snapshot(): OptionsFormSnapshot {
    return {
      model: this.#model,
      effort: this.#effort,
      provider: this.#provider,
      contextNotePaths: Array.from(this.#contextNotePaths),
      followUp: this.#followUp,
      executeOnNote: this.#executeOnNote,
    };
  }

  onChange(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  #emit(): void {
    this.#listeners.forEach((cb) => cb());
  }
}
