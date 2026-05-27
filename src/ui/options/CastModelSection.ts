import type { KeyboardController } from '../../infra/KeyboardController';
import { SUPPORTED_MODELS } from '../../domain/settings/Settings';
import type { Effort } from '../../domain/settings/Settings';
import { buildModelSelect } from '../widgets/ModelSelect';
import { EffortRow } from '../widgets/EffortRow';
import type { OptionsFormState } from './OptionsFormState';
import type { OptionsSnapshot } from './OptionsSnapshot';
import { snapshotEqualsCurrent } from './OptionsSnapshot';
import type { SpellPath } from '../../domain/spells/SpellPath';
import type { CastingFrontmatterWriter, CastingFrontmatterReader } from '../../infra/castingFrontmatter';
import type { SpellCastingSettings } from '../../domain/settings/CastingSettings';
import { CLAUDE_CODE_PROVIDER } from '../../domain/settings/CastingSettings';
import type { ModelId } from '../../domain/settings/ModelId';

export interface CastModelSectionDeps {
  spellPath: SpellPath;
  onOverrideChanged: () => void;
  /** Writes spell-local casting settings to frontmatter on Cast when the block has changed. */
  writeCasting: CastingFrontmatterWriter;
  /** Reads the current casting block for change-detection before writing on Cast. */
  reader: CastingFrontmatterReader;
  /** Writes vault-wide default model/effort to plugin settings when "Set as default" is ticked. */
  setVaultDefault: (model: ModelId, effort: Effort | null) => void;
}

/**
 * Form section for selecting cast model and effort, with "Set as default" checkbox.
 * Manages reactive visibility: checkbox only shows when effort differs from snapshot
 * and the model supports effort options. Handles dynamic mounting/unmounting of EffortRow.
 */
export class CastModelSection {
  #kb: KeyboardController;
  #effortRow = new EffortRow();
  #effortContainer!: HTMLDivElement;
  #effortRowMounted = false;
  #checkboxLabel!: HTMLLabelElement;
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
    const { checkboxLabel, checkbox } = this.#buildSetAsDefaultCheckbox(container);
    this.#checkboxLabel = checkboxLabel;
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
    container.createSpan({ text: 'Cast model settings', cls: 'grimoire-section-label' });
  }

  #buildModelSelect(container: HTMLElement, formState: OptionsFormState): void {
    this.#select = buildModelSelect({
      container,
      kb: this.#kb,
      models: SUPPORTED_MODELS,
      initialModel: formState.snapshot().model,
      onChange: (id) => formState.setModel(id, SUPPORTED_MODELS),
    });
  }

  #buildEffortContainer(container: HTMLElement, formState: OptionsFormState): void {
    this.#effortContainer = container.createDiv();
    const snap = formState.snapshot();
    this.#effortRowMounted = SUPPORTED_MODELS.find((m) => m.id === snap.model)?.effortOptions !== null;
    this.#effortRow.mount(this.#effortContainer, {
      models: SUPPORTED_MODELS,
      modelId: snap.model,
      effort: snap.effort,
      onChange: (e: Effort) => formState.setEffort(e),
    });
  }

  #buildSetAsDefaultCheckbox(container: HTMLElement): { checkboxLabel: HTMLLabelElement; checkbox: HTMLInputElement } {
    const checkboxLabel = container.createEl('label');
    checkboxLabel.hide();
    const checkbox = checkboxLabel.createEl('input');
    checkbox.type = 'checkbox';
    checkbox.dataset['grimoire'] = 'set-as-default';
    checkboxLabel.append('Set as default');
    return { checkboxLabel, checkbox };
  }

  #bindSetAsDefault(checkbox: HTMLInputElement, formState: OptionsFormState, deps: CastModelSectionDeps): void {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        const current = formState.snapshot();
        deps.setVaultDefault(current.model, current.effort);
      }
      // Unchecked: vault-wide default cannot be unset per-spell; just refresh.
      deps.onOverrideChanged();
    });
  }

  /**
   * Writes the current form state to spell frontmatter if the casting block has changed.
   * Call this from the host's cast handler, immediately before invoking `onCast`.
   * Failures are swallowed (fire-and-forget write — cast still proceeds).
   */
  persistBlockOnCast(formState: OptionsFormState, deps: CastModelSectionDeps): void {
    const current = formState.snapshot();
    const currentBlock = deps.reader(deps.spellPath);
    const newBlock: SpellCastingSettings = {
      provider: CLAUDE_CODE_PROVIDER,
      model: current.model,
      effort: current.effort ?? undefined,
    };
    if (this.#blockChanged(currentBlock, newBlock)) {
      deps.writeCasting(deps.spellPath, newBlock).catch(() => { /* write failures are non-fatal */ });
    }
  }

  /**
   * Returns true when the about-to-write block differs from the stored block,
   * or when there is no stored block yet (first write).
   */
  #blockChanged(current: SpellCastingSettings | null, next: SpellCastingSettings): boolean {
    if (current === null) return true;
    return current.provider !== next.provider
      || current.model !== next.model
      || current.effort !== next.effort;
  }

  #updateReactive(formState: OptionsFormState, snapshot: OptionsSnapshot, deps: CastModelSectionDeps): void {
    const current = formState.snapshot();
    const matches = snapshotEqualsCurrent(snapshot, current);
    const currentModel = SUPPORTED_MODELS.find((m) => m.id === current.model);
    const effortPersistable = currentModel != null && currentModel.effortOptions !== null;
    this.#checkboxLabel.style.display = !matches && effortPersistable ? '' : 'none';
    this.#checkbox.checked = deps.reader(deps.spellPath) !== null;
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
