import type { App, Scope } from 'obsidian';
import { KeyboardController } from '../../infra/KeyboardController';
import { ContextNotesInput } from '../widgets/ContextNotesInput';
import type { OptionsFormState, OptionsFormSnapshot } from './OptionsFormState';
import type { OptionsSnapshot } from './OptionsSnapshot';
import type { OptionsSessionMap } from './OptionsSessionMap';
import type { SpellPath } from '../../domain/spells/SpellPath';
import { CastModelSection } from './CastModelSection';
import type { CastModelSectionDeps } from './CastModelSection';
import { RefineVariantSelect } from './RefineVariantSelect';
import type { RefineVariantSelectDeps } from './RefineVariantSelect';
import { attachAutogrow, attachListContinuation } from '../widgets/textareaHelpers';
import type { CastingFrontmatterWriter, CastingFrontmatterReader } from '../../infra/castingFrontmatter';
import type { ModelId } from '../../domain/settings/ModelId';
import type { Effort } from '../../domain/settings/Settings';

interface ExecuteOnNoteState {
  checkbox: HTMLInputElement | null;
  initialValue: boolean;
  visible: boolean;
}

export interface OptionsPanelDeps {
  app: App;
  sessionMap: OptionsSessionMap;
  spellPath: SpellPath;
  onCast: (snapshot: OptionsFormSnapshot) => void;
  onOverrideChanged: () => void;
  onBack: () => void;
  showExecuteOnNote?: boolean;
  /** Optional variant selector for the Refine sentinel panel. Omit for spell panels. */
  refineVariantSelectDeps?: RefineVariantSelectDeps;
  /** Called when the user clicks the Forge button to update this spell. Omit for Refine sentinel panels. */
  onForgeUpdate?: () => void;
  /** Writes spell-local casting settings to frontmatter on Cast when the block has changed. */
  writeCasting: CastingFrontmatterWriter;
  /** Reads the current casting block for change-detection before writing on Cast. */
  reader: CastingFrontmatterReader;
  /** Writes vault-wide default model/effort to plugin settings when "Set as default" is ticked. */
  setVaultDefault: (model: ModelId, effort: Effort | null) => void;
}

/**
 * Panel for spell casting options: context notes, follow-up, executeOnNote toggle,
 * and model/effort selection. Owns sub-components (ContextNotesInput, CastModelSection),
 * a keyboard controller for Mod+Enter to cast, and reset/cast buttons.
 */
export class OptionsPanel {
  #kb: KeyboardController;
  #contextNotesInput: ContextNotesInput;
  #castModelSection: CastModelSection;
  #refineVariantSelect: RefineVariantSelect | null = null;
  #formAbort: AbortController | null = null;

  constructor(scope: Scope) {
    this.#kb = new KeyboardController(scope);
    this.#contextNotesInput = new ContextNotesInput();
    this.#castModelSection = new CastModelSection(this.#kb);
  }

  render(
    contentEl: HTMLElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  ): void {
    this.#formAbort = new AbortController();
    const { signal } = this.#formAbort;
    const backBtn = this.#buildBackButton(contentEl);
    this.#bindBackButton(backBtn, deps.onBack, signal);
    const form = this.#buildForm(contentEl);
    this.#buildFormControls(form, formState, snapshot, deps, signal);
  }

  destroy(): void {
    this.#kb.unbindAll();
    this.#castModelSection.destroy();
    this.#contextNotesInput.detach();
    this.#refineVariantSelect?.destroy();
    this.#formAbort?.abort();
  }

  #buildBackButton(container: HTMLElement): HTMLButtonElement {
    const nav = container.createDiv({ cls: 'grimoire-nav-bar' });
    const backBtn = nav.createEl('button', { text: '← back' });
    backBtn.type = 'button';
    nav.createSpan({ cls: 'hotkey-hint', text: 'Tab navigate · Esc back · ⌘↵ Cast' });
    return backBtn;
  }

  #bindBackButton(button: HTMLButtonElement, onBack: () => void, signal: AbortSignal): void {
    button.addEventListener('click', () => onBack(), { signal });
  }

  #buildForm(contentEl: HTMLElement): HTMLFormElement {
    return contentEl.createEl('form', { cls: 'options-panel' });
  }

  #buildFormControls(
    form: HTMLFormElement,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
    signal: AbortSignal,
  ): void {
    const followUpInput = this.#buildFollowUpInput(form, formState.snapshot().followUp, signal);
    this.#buildContextNotes(form, formState, deps.app);
    this.#bindFollowUpInput(followUpInput, formState, signal);
    const eonState: ExecuteOnNoteState = {
      initialValue: formState.snapshot().executeOnNote,
      visible: deps.showExecuteOnNote !== false,
      checkbox: null,
    };
    eonState.checkbox = eonState.visible ? this.#buildExecuteOnNoteCheckbox(form, eonState.initialValue) : null;
    if (eonState.checkbox) {
      this.#bindExecuteOnNote(eonState.checkbox, formState, signal);
    }
    const castModelDeps: CastModelSectionDeps = {
      spellPath: deps.spellPath,
      onOverrideChanged: deps.onOverrideChanged,
      writeCasting: deps.writeCasting,
      reader: deps.reader,
      setVaultDefault: deps.setVaultDefault,
    };
    this.#castModelSection.mount(form, formState, snapshot, castModelDeps);
    const cast = () => {
      const current = formState.snapshot();
      this.#castModelSection.persistBlockOnCast(formState, castModelDeps);
      // provider is not in OptionsSessionEntry — it is always re-resolved from frontmatter, not session-cached.
      deps.sessionMap.put(deps.spellPath, { ...current, followUp: '' });
      followUpInput.value = '';
      formState.setFollowUp('');
      deps.onCast(current);
    };
    const buttonRow = form.createDiv({ cls: 'grimoire-button-row' });
    this.#buildCastButton(buttonRow);
    this.#bindFormSubmit(form, cast);
    this.#bindCastKey(cast);
    const resetBtn = this.#buildResetButton(buttonRow);
    this.#bindReset(resetBtn, snapshot, formState, deps, followUpInput, eonState, signal);
    if (deps.refineVariantSelectDeps) {
      const refineWrapper = buttonRow.createDiv({ cls: 'grimoire-refine-inline' });
      this.#refineVariantSelect = new RefineVariantSelect();
      this.#refineVariantSelect.mount(refineWrapper, deps.refineVariantSelectDeps);
    }
    if (deps.onForgeUpdate) {
      const forgeBtn = buttonRow.createEl('button', { text: 'Forge', cls: 'grimoire-forge-btn' });
      forgeBtn.type = 'button';
      forgeBtn.addEventListener('click', () => deps.onForgeUpdate?.(), { signal });
    }
  }

  /** Mounts the context notes input widget and populates it with any existing session paths. */
  #buildContextNotes(form: HTMLFormElement, formState: OptionsFormState, app: App): void {
    const contextContainer = form.createDiv();

    this.#contextNotesInput.mount(contextContainer, {
      app,
      onChange: (paths) => formState.setContextNotePaths(paths),
    });

    const initialPaths = formState.snapshot().contextNotePaths;
    if (initialPaths.length > 0) {
      this.#contextNotesInput.addPaths(initialPaths);
    }
  }

  #buildFollowUpInput(form: HTMLFormElement, followUp: string, signal: AbortSignal): HTMLTextAreaElement {
    const textarea = form.createEl('textarea');
    textarea.placeholder = 'Follow-up';
    textarea.value = followUp;
    attachAutogrow(textarea, signal);
    attachListContinuation(textarea, signal);
    return textarea;
  }

  #bindFollowUpInput(followUpInput: HTMLTextAreaElement, formState: OptionsFormState, signal: AbortSignal): void {
    followUpInput.addEventListener('input', () => {
      formState.setFollowUp(followUpInput.value);
    }, { signal });
  }

  #buildExecuteOnNoteCheckbox(form: HTMLFormElement, initialValue: boolean): HTMLInputElement {
    const container = form.createDiv({ cls: 'grimoire-checkbox-row' });
    const checkbox = container.createEl('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'grimoire-execute-on-note';
    checkbox.dataset['grimoire'] = 'execute-on-note';
    checkbox.checked = initialValue;
    const label = container.createEl('label', { text: 'Run on active note' });
    label.htmlFor = checkbox.id;
    return checkbox;
  }

  #bindExecuteOnNote(checkbox: HTMLInputElement, formState: OptionsFormState, signal: AbortSignal): void {
    checkbox.addEventListener('change', () => {
      formState.setExecuteOnNote(checkbox.checked);
    }, { signal });
  }

  #buildCastButton(container: HTMLElement): void {
    const castBtn = container.createEl('button', { text: 'Cast', cls: 'mod-cta' });
    castBtn.type = 'submit';
  }

  #bindFormSubmit(form: HTMLFormElement, cast: () => void): void {
    form.onsubmit = (e) => {
      e.preventDefault();
      cast();
    };
  }

  #bindCastKey(cast: () => void): void {
    this.#kb.bind(['Mod'], 'Enter', () => {
      cast();
      return true;
    });
  }

  #buildResetButton(container: HTMLElement): HTMLButtonElement {
    const resetBtn = container.createEl('button', { text: 'Reset' });
    resetBtn.type = 'button';
    return resetBtn;
  }

  #bindReset(
    button: HTMLButtonElement,
    snapshot: OptionsSnapshot,
    formState: OptionsFormState,
    deps: OptionsPanelDeps,
    followUpInput: HTMLTextAreaElement,
    eonState: ExecuteOnNoteState,
    signal: AbortSignal,
  ): void {
    button.addEventListener('click', () => {
      this.#castModelSection.resetToSnapshot(snapshot, formState);
      this.#contextNotesInput.clear();
      followUpInput.value = '';
      formState.setFollowUp('');
      formState.setExecuteOnNote(eonState.initialValue);
      if (eonState.visible && eonState.checkbox) {
        eonState.checkbox.checked = eonState.initialValue;
      }
      deps.sessionMap.delete(deps.spellPath);
    }, { signal });
  }
}

