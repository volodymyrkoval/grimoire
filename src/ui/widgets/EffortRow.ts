import { SegmentedControl } from './SegmentedControl';
import { Effort, SupportedModel } from '../../domain/settings/Settings';
import type { ModelId } from '../../domain/settings/ModelId';
import type { Logger } from '../../infra/Logger';

export interface EffortRowOpts {
  models: readonly SupportedModel[];
  modelId: ModelId;
  effort: Effort | null;
  onChange: (effort: Effort) => void;
}

/** Constructor deps for {@link EffortRow}. */
export interface EffortRowDeps {
  logger?: Logger;
}

/**
 * Conditionally mounts a segmented control for model effort selection.
 * Effort row only mounts if the model has effortOptions; intelligently mounts/unmounts
 * as the model changes. Stores state to handle model changes that gain or lose effort options.
 */
export class EffortRow {
  readonly #logger: Logger | undefined;
  #segmented: SegmentedControl<Effort> | null = null;
  #wrapper: HTMLElement | null = null;
  #parent: HTMLElement | null = null;
  #models: readonly SupportedModel[] = [];
  #onChange: ((effort: Effort) => void) | null = null;

  constructor(deps?: EffortRowDeps) {
    this.#logger = deps?.logger;
  }

  mount(parent: HTMLElement, opts: EffortRowOpts): void {
    // Store for later use in update (must happen before any early return)
    this.#models = opts.models;
    this.#onChange = opts.onChange;
    this.#parent = parent;

    // Look up the model
    const model = opts.models.find((m) => m.id === opts.modelId);
    if (!model) {
      this.#logger?.error(`EffortRow.mount: model ${opts.modelId} not found`);
      return;
    }

    // If model has no effort options, don't mount anything
    if (model.effortOptions === null) {
      return;
    }

    // Create wrapper div
    const wrapper = parent.createDiv({ cls: 'grimoire-effort-row' });
    this.#wrapper = wrapper;

    // Determine the initial effort value
    const initialEffort = opts.effort ?? model.defaultEffort;
    if (initialEffort === null) {
      this.#logger?.error(
        `EffortRow.mount: model ${opts.modelId} has no default effort and none provided`
      );
      return;
    }

    // Instantiate SegmentedControl
    this.#segmented = new SegmentedControl(wrapper, {
      options: model.effortOptions,
      value: initialEffort,
      onChange: opts.onChange,
    });
  }

  update(modelId: ModelId, effort: Effort | null): void {
    // Look up the model
    const model = this.#models.find((m) => m.id === modelId);
    if (!model) {
      this.#logger?.error(`EffortRow.update: model ${modelId} not found`);
      return;
    }

    // Case 1: Row is currently mounted AND new model has options
    if (this.#segmented && model.effortOptions !== null) {
      const effortToUse = effort ?? model.defaultEffort;
      if (effortToUse !== null) {
        this.#segmented.setOptions(model.effortOptions, effortToUse);
      }
      return;
    }

    // Case 2: Row is currently mounted AND new model has NO options → unmount
    if (this.#segmented && model.effortOptions === null) {
      this.#wrapper?.parentNode?.removeChild(this.#wrapper);
      this.#wrapper = null;
      this.#segmented = null;
      return;
    }

    // Case 3: Row is NOT mounted AND new model has options
    if (!this.#segmented && model.effortOptions !== null && this.#parent && this.#onChange) {
      this.mount(this.#parent, {
        models: this.#models,
        modelId,
        effort,
        onChange: this.#onChange,
      });
      return;
    }

    // Case 4: NOT mounted AND no options — no-op
  }
}
