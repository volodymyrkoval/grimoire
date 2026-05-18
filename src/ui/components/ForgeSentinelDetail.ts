import { Scope } from 'obsidian';
import { KeyboardController } from '../../infra/KeyboardController';
import { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import { ForgeUpdateFormSnapshot } from '../../forge/ForgeUpdateFormSnapshot';
import { SUPPORTED_MODELS, Effort } from '../../domain/settings/Settings';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import { EffortRow } from '../widgets/EffortRow';
import { buildModelSelect } from '../widgets/ModelSelect';
import { modelId, type ModelId } from '../../domain/settings/ModelId';
import type { ForgeMode } from '../../forge/ForgeMode';

export interface ForgeSentinelDetailParams {
  contentEl: HTMLElement;
  mode: ForgeMode;
  callbacks: {
    onBack: () => void;
    onCreateSubmit: (snapshot: ForgeFormSnapshot) => void;
    onUpdateSubmit: (snapshot: ForgeUpdateFormSnapshot) => void;
  };
  defaults: FormDefaults;
}

/** Detail panel for the Forge sentinel: name/description/model form with its own keyboard bindings. */
export class ForgeSentinelDetail {
  #nameInput!: HTMLInputElement;
  #descInput!: HTMLTextAreaElement;
  #modelSelect!: HTMLSelectElement;
  #effortRow!: EffortRow;
  #currentEffort!: Effort | null;
  #executeOnNote: boolean = true;
  #applyCastDirectives: boolean = true;
  #submitBtn!: HTMLButtonElement;
  #mode!: ForgeMode;
  #kb: KeyboardController;

  constructor(scope: Scope) {
    this.#kb = new KeyboardController(scope);
  }


  render({ contentEl, mode, callbacks, defaults }: ForgeSentinelDetailParams): void {
    this.#mode = mode;
    // In update mode with no directives, the checkbox is absent — default to false
    this.#applyCastDirectives = mode.kind === 'update' ? mode.directiveCount > 0 : true;
    this.#buildBackButton(contentEl, callbacks.onBack);
    const form = this.#buildForm(contentEl);

    if (mode.kind === 'create') {
      this.#nameInput = this.#buildNameField(form);
    } else {
      this.#buildStaticNameField(form, mode.spell.name);
    }

    this.#descInput = this.#buildDescriptionField(form, mode.kind === 'update' ? 'What should change about this spell?' : 'Description');
    this.#buildCheckbox(form, mode);
    this.#buildModelSectionHeader(form);
    this.#modelSelect = this.#buildModelSelect(form, defaults.defaultModel);
    this.#currentEffort = this.#resolveInitialEffort(defaults);
    this.#effortRow = this.#initEffortRow(form, defaults);
    this.#submitBtn = this.#buildSubmitButton(form);
    this.#wireSubmitHandler(form, mode, callbacks);

    this.#descInput.addEventListener('input', () => {
      this.#updateSubmitButtonState(this.#descInput.value, this.#applyCastDirectives, mode.kind === 'update' ? mode.directiveCount : 0);
    });

    this.#updateSubmitButtonState(this.#descInput.value, this.#applyCastDirectives, mode.kind === 'update' ? mode.directiveCount : 0);
  }

  /**
   * Release component-owned key bindings on the shared scope.
   * Must be called before the parent re-binds its own keys; otherwise stale
   * ArrowDown/ArrowUp handlers will intercept popup navigation.
   */
  destroy(): void {
    this.#kb.unbindAll();
  }

  #applyModelChange(): void {
    this.#currentEffort = null;
    this.#effortRow.update(modelId(this.#modelSelect.value), null);
  }

  #buildForm(contentEl: HTMLElement): HTMLFormElement {
    return contentEl.createEl('form', { cls: 'forge-sentinel-form' });
  }

  #resolveInitialEffort(defaults: FormDefaults): Effort | null {
    const initialModel = SUPPORTED_MODELS.find((m) => m.id === defaults.defaultModel);
    return defaults.defaultEffort ?? (initialModel?.defaultEffort ?? null);
  }

  #initEffortRow(form: HTMLElement, defaults: FormDefaults): EffortRow {
    const effortContainer = form.createDiv();
    const row = new EffortRow();
    row.mount(effortContainer, {
      models: SUPPORTED_MODELS,
      modelId: defaults.defaultModel,
      effort: this.#currentEffort,
      onChange: (effort) => { this.#currentEffort = effort; },
    });
    return row;
  }

  #buildBackButton(contentEl: HTMLElement, onBack: () => void): void {
    const back = contentEl.createEl('button', { text: '← back' });
    back.type = 'button';
    back.addEventListener('click', () => onBack());
  }

  #buildNameField(form: HTMLElement): HTMLInputElement {
    const label = form.createEl('label');
    const input = label.createEl('input');
    input.type = 'text';
    input.placeholder = 'Name';
    input.focus();
    return input;
  }

  #buildStaticNameField(form: HTMLElement, spellName: string): void {
    const label = form.createEl('label');
    label.createSpan({ text: 'Updating spell:' });
    const div = label.createDiv();
    div.dataset['grimoire'] = 'spell-name';
    div.textContent = spellName;
  }

  #buildDescriptionField(form: HTMLElement, placeholder: string): HTMLTextAreaElement {
    const label = form.createEl('label');
    const textarea = label.createEl('textarea');
    textarea.placeholder = placeholder;
    return textarea;
  }

  #buildCheckbox(form: HTMLElement, mode: ForgeMode): void {
    if (mode.kind === 'create') {
      this.#buildExecuteOnNoteCheckbox(form);
    } else if (mode.directiveCount > 0) {
      this.#buildApplyCastDirectivesCheckbox(form, mode.directiveCount);
    }
    // update mode with directiveCount === 0: no checkbox
  }

  #buildSubmitButton(form: HTMLFormElement): HTMLButtonElement {
    const buttonRow = form.createDiv({ cls: 'grimoire-button-row' });
    const submitBtn = buttonRow.createEl('button', { text: 'Submit' });
    submitBtn.type = 'submit';
    return submitBtn;
  }

  #buildModelSectionHeader(form: HTMLElement): void {
    form.createEl('hr');
    form.createEl('small', { text: 'Forging model settings' });
  }

  #buildExecuteOnNoteCheckbox(form: HTMLElement): void {
    const label = form.createEl('label');
    const input = label.createEl('input');
    input.type = 'checkbox';
    input.dataset['grimoire'] = 'execute-on-note';
    input.checked = true;
    input.addEventListener('change', () => { this.#executeOnNote = input.checked; });
    label.append(' Execute on active note');
  }

  #buildApplyCastDirectivesCheckbox(form: HTMLElement, directiveCount: number): void {
    const label = form.createEl('label');
    const input = label.createEl('input');
    input.type = 'checkbox';
    input.dataset['grimoire'] = 'apply-cast-directives';
    input.checked = true;
    const noun = directiveCount === 1 ? 'directive' : 'directives';
    label.append(` Apply @cast directives (${directiveCount} ${noun} found)`);
    input.addEventListener('change', () => {
      this.#applyCastDirectives = input.checked;
      if (this.#mode.kind === 'update') {
        this.#updateSubmitButtonState(this.#descInput.value, this.#applyCastDirectives, this.#mode.directiveCount);
      }
    });
  }

  #buildModelSelect(form: HTMLElement, defaultModel: ModelId): HTMLSelectElement {
    const label = form.createEl('label');
    return buildModelSelect({
      container: label,
      kb: this.#kb,
      models: SUPPORTED_MODELS,
      initialModel: defaultModel,
      onChange: () => this.#applyModelChange(),
    });
  }

  #updateSubmitButtonState(description: string, applyCastDirectives: boolean, directiveCount: number): void {
    if (this.#mode.kind !== 'update') return;
    const enabled = description.trim().length > 0 || (applyCastDirectives && directiveCount > 0);
    this.#submitBtn.disabled = !enabled;
  }

  #wireSubmitHandler(
    form: HTMLFormElement,
    mode: ForgeMode,
    callbacks: ForgeSentinelDetailParams['callbacks'],
  ): void {
    form.onsubmit = (e: Event): void => {
      e.preventDefault();
      if (mode.kind === 'create') {
        callbacks.onCreateSubmit({
          name: this.#nameInput.value || '',
          description: this.#descInput.value || '',
          model: modelId(this.#modelSelect.value),
          effort: this.#currentEffort,
          executeOnNote: this.#executeOnNote,
        });
      } else {
        callbacks.onUpdateSubmit({
          spellPath: mode.spell.path,
          spellName: mode.spell.name,
          description: this.#descInput.value || '',
          model: modelId(this.#modelSelect.value),
          effort: this.#currentEffort,
          applyCastDirectives: this.#applyCastDirectives,
          directiveCount: mode.directiveCount,
        });
      }
    };
  }
}
