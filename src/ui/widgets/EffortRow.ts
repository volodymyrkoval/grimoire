import { SegmentedControl } from '../SegmentedControl';
import { Effort, SupportedModel } from '../../domain/settings/Settings';

export interface EffortRowOpts {
  models: readonly SupportedModel[];
  modelId: string;
  effort: Effort | null;
  onChange: (effort: Effort) => void;
}

export class EffortRow {
  #segmented: SegmentedControl<Effort> | null = null;
  #wrapper: HTMLElement | null = null;
  #parent: HTMLElement | null = null;
  #models: readonly SupportedModel[] = [];
  #onChange: ((effort: Effort) => void) | null = null;

  mount(parent: HTMLElement, opts: EffortRowOpts): void {
    // Look up the model
    const model = opts.models.find((m) => m.id === opts.modelId);
    if (!model) {
      console.error(`EffortRow.mount: model ${opts.modelId} not found`);
      return;
    }

    // Store for later use in update (must happen before any early return)
    this.#models = opts.models;
    this.#onChange = opts.onChange;
    this.#parent = parent;

    // If model has no effort options, don't mount anything
    if (model.effortOptions === null) {
      return;
    }

    // Create wrapper div
    const wrapper = activeDocument.createDiv();
    wrapper.className = 'grimoire-effort-row';
    this.#wrapper = wrapper;
    parent.appendChild(wrapper);

    // Determine the initial effort value
    const initialEffort = opts.effort ?? model.defaultEffort;
    if (initialEffort === null) {
      console.error(
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

  update(modelId: string, effort: Effort | null): void {
    // Look up the model
    const model = this.#models.find((m) => m.id === modelId);
    if (!model) {
      console.error(`EffortRow.update: model ${modelId} not found`);
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
