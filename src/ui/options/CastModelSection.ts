import { Setting } from 'obsidian';
import type { KeyboardController } from '../../infra/KeyboardController';
import { SUPPORTED_MODELS } from '../../domain/settings/Settings';
import type { Effort } from '../../domain/settings/Settings';
import { buildModelSelect } from '../widgets/ModelSelect';
import { EffortRow } from '../widgets/EffortRow';
import type { OptionsFormState } from './OptionsFormState';
import type { OptionsSnapshot } from './OptionsSnapshot';
import { snapshotEqualsCurrent } from './OptionsSnapshot';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SpellPath } from '../../domain/spells/SpellPath';

export interface CastModelSectionDeps {
  overrides: SpellOverrideStore;
  spellPath: SpellPath;
  onOverrideChanged: () => void;
}

/**
 * Form section for selecting cast model and effort, with "Set as default" checkbox.
 * Manages reactive visibility: checkbox only shows when effort differs from snapshot
 * and the model supports effort options. Handles dynamic mounting/unmounting of EffortRow.
 */
export class CastModelSection {
  #kb: KeyboardController;
  #effortRow = new EffortRow();
  #effortContainer!: HTMLElement;
  #effortRowMounted = false;
  #setAsDefaultRow!: HTMLElement;
  #checkbox!: HTMLInputElement;
  #select!: HTMLSelectElement;
  #unsubscribe!: () => void;

  constructor(kb: KeyboardController) {
    this.#kb = kb;
  }

  mount(
    container: HTMLElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: CastModelSectionDeps,
  ): void {
    this.#buildHeader(container);
    this.#buildModelSelect(container, formState);
    this.#buildEffortContainer(container, formState);
    const { settingEl, checkbox } = this.#buildSetAsDefaultCheckbox(container);
    this.#setAsDefaultRow = settingEl;
    this.#checkbox = checkbox;
    this.#bindSetAsDefault(checkbox, formState, deps);
    this.#unsubscribe = this.#subscribeReactive(formState, snapshot, deps);
    this.#updateReactive(formState, snapshot, deps);
  }

  resetToSnapshot(snapshot: OptionsSnapshot, formState: OptionsFormState): void {
    formState.setModel(snapshot.model, SUPPORTED_MODELS);
    if (snapshot.effort !== null) {
      formState.setEffort(snapshot.effort);
    }
    this.#select.value = snapshot.model;
  }

  destroy(): void {
    this.#unsubscribe();
  }

  #buildHeader(container: HTMLElement): void {
    new Setting(container).setName('Cast model settings').setHeading();
  }

  #buildModelSelect(container: HTMLElement, formState: OptionsFormState): void {
    const setting = new Setting(container).setName('Model');
    this.#select = buildModelSelect({
      container: setting.controlEl,
      kb: this.#kb,
      models: SUPPORTED_MODELS,
      initialModel: formState.snapshot().model,
      onChange: (id) => formState.setModel(id, SUPPORTED_MODELS),
    });
  }

  #buildEffortContainer(container: HTMLElement, formState: OptionsFormState): void {
    const effortSetting = new Setting(container).setName('Effort');
    this.#effortContainer = effortSetting.controlEl;
    const snap = formState.snapshot();
    this.#effortRowMounted = SUPPORTED_MODELS.find((m) => m.id === snap.model)?.effortOptions !== null;
    this.#effortRow.mount(this.#effortContainer, {
      models: SUPPORTED_MODELS,
      modelId: snap.model,
      effort: snap.effort,
      onChange: (e: Effort) => formState.setEffort(e),
    });
  }

  #buildSetAsDefaultCheckbox(container: HTMLElement): { settingEl: HTMLElement; checkbox: HTMLInputElement } {
    const setting = new Setting(container).setName('Set as default').addToggle((toggle) => {
      toggle.setValue(false);
    });
    // Apply data-grimoire to the inner checkbox so selector-based test queries resolve.
    const checkbox = setting.controlEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) throw new Error('Setting toggle did not render a checkbox (set-as-default)');
    checkbox.dataset['grimoire'] = 'set-as-default';
    // Tag settingEl so visibility-control callers can locate the entire row (not just the input).
    setting.settingEl.dataset['grimoire'] = 'set-as-default-row';
    // Start hidden — #updateReactive controls visibility via style.display.
    setting.settingEl.hide();
    return { settingEl: setting.settingEl, checkbox };
  }

  #bindSetAsDefault(checkbox: HTMLInputElement, formState: OptionsFormState, deps: CastModelSectionDeps): void {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        const current = formState.snapshot();
        deps.overrides.set(deps.spellPath, { model: current.model, effort: current.effort! });
      } else {
        deps.overrides.clear(deps.spellPath);
      }
      deps.onOverrideChanged();
    });
  }

  #updateReactive(formState: OptionsFormState, snapshot: OptionsSnapshot, deps: CastModelSectionDeps): void {
    const current = formState.snapshot();
    const matches = snapshotEqualsCurrent(snapshot, current);
    const effortPersistable = snapshot.effort !== null;
    this.#setAsDefaultRow.style.display = !matches && effortPersistable ? '' : 'none';
    this.#checkbox.checked = deps.overrides.has(deps.spellPath);
  }

  #subscribeReactive(
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: CastModelSectionDeps,
  ): () => void {
    return formState.onChange(() => {
      const current = formState.snapshot();
      if (this.#effortRowMounted) {
        this.#effortRow.update(current.model, current.effort);
      } else {
        // EffortRow was never mounted (started as Haiku); try mounting now if model gained effort.
        const newModel = SUPPORTED_MODELS.find((m) => m.id === current.model);
        if (newModel?.effortOptions !== null) {
          this.#effortRow.mount(this.#effortContainer, {
            models: SUPPORTED_MODELS,
            modelId: current.model,
            effort: current.effort,
            onChange: (e) => formState.setEffort(e),
          });
          this.#effortRowMounted = true;
        }
      }
      this.#updateReactive(formState, snapshot, deps);
    });
  }
}
