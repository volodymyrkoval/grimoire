import { Effort, SupportedModel } from "../../domain/settings/Settings";
import type { FormDefaults } from "../../domain/settings/FormDefaults";
import type { Spell } from "../../domain/spells/Spell";

export interface OptionsFormSnapshot {
  model: string;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  executeOnNote: boolean;
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
    contextNotePaths: [],
    followUp: "",
    executeOnNote: spell.executeOnNote,
  };
}

/**
 * Reactive form state for casting options (model, effort, context notes, follow-up, executeOnNote).
 * Implements reactive pattern: listeners are notified on any change via onChange.
 * setModel applies effort survival rule: current effort persists if valid for new model.
 */
export class OptionsFormState {
  #model: string;
  #effort: Effort | null;
  #contextNotePaths: readonly string[];
  #followUp: string;
  #executeOnNote: boolean;
  #listeners: Set<() => void>;

  constructor(initial: OptionsFormSnapshot) {
    this.#model = initial.model;
    this.#effort = initial.effort;
    this.#contextNotePaths = initial.contextNotePaths;
    this.#followUp = initial.followUp;
    this.#executeOnNote = initial.executeOnNote;
    this.#listeners = new Set();
  }

  setModel(modelId: string, models: readonly SupportedModel[]): Effort | null {
    // Find the model; fall back to models[0] if not found
    let resolvedModel = models.find((m) => m.id === modelId);
    if (!resolvedModel) {
      console.warn(`Model ${modelId} not found in SUPPORTED_MODELS, falling back to ${models[0].id}`);
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
