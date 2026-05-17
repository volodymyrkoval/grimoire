import { SpellPath } from "../spells/SpellPath";
import { GrimoireData, SpellOverride, SUPPORTED_MODELS, Effort } from "./Settings";
import type { SaveScheduler } from "./SaveScheduler";

/** Dependencies for initializing the spell override store. */
export interface SpellOverrideStoreDeps {
  data: GrimoireData;
  saver: SaveScheduler;
}

/**
 * Manages per-spell model and effort overrides with validation and debounced persistence.
 * Prevents invalid overrides (unknown models, missing effort support) from being stored.
 */
export class SpellOverrideStore {
  #data: GrimoireData;
  #saver: SaveScheduler;

  constructor(deps: SpellOverrideStoreDeps) {
    this.#data = deps.data;
    this.#saver = deps.saver;
  }

  get(path: SpellPath): SpellOverride | undefined {
    return this.#data.spellOverrides[path];
  }

  has(path: SpellPath): boolean {
    return path in this.#data.spellOverrides;
  }

  set(path: SpellPath, override: SpellOverride): void {
    const model = SUPPORTED_MODELS.find((m) => m.id === override.model);

    // UI pre-validates; these guards are defence-in-depth, not the primary check.
    if (!model) {
      console.error(`Unknown model: ${override.model}`);
      return;
    }

    if (model.defaultEffort === null) {
      console.error(`Cannot set override for model with no effort support: ${override.model}`);
      return;
    }

    const clampedEffort = this.#clampEffort(model, override.effort);

    this.#data.spellOverrides[path] = {
      model: override.model,
      effort: clampedEffort,
    };

    this.#saver.schedule();
  }

  clear(path: SpellPath): void {
    if (!(path in this.#data.spellOverrides)) {
      return;
    }

    delete this.#data.spellOverrides[path];
    this.#saver.schedule();
  }

  #clampEffort(model: { effortOptions: readonly Effort[] | null; defaultEffort: Effort | null }, effort: Effort): Effort {
    if (model.effortOptions && !model.effortOptions.includes(effort)) {
      return model.defaultEffort!;
    }
    return effort;
  }
}
