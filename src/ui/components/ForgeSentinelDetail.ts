import { Scope, Setting } from 'obsidian';
import { KeyboardController } from '../../infra/KeyboardController';
import { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import { ForgeUpdateFormSnapshot } from '../../forge/ForgeUpdateFormSnapshot';
import { SUPPORTED_MODELS, Effort } from '../../domain/settings/Settings';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import type { SpellPath } from '../../domain/spells/SpellPath';
import { EffortRow } from '../widgets/EffortRow';
import { buildModelSelect } from '../widgets/ModelSelect';
import { modelId, type ModelId } from '../../domain/settings/ModelId';
import type { ForgeMode } from '../../forge/ForgeMode';
import type { Hotkey } from '../../domain/spells/Hotkey';
import type { HotkeyDirectory } from '../../forge/HotkeyDirectory';
import { HotkeyCaptureField } from './HotkeyCaptureField';

/** Callback to erase a hotkey binding for a spell. */
export type HotkeyEraser = (spellPath: SpellPath) => Promise<void>;

/** Callback to write a hotkey binding to a spell's frontmatter. */
export type HotkeyWriter = (spellPath: SpellPath, hotkey: Hotkey) => Promise<void>;

export interface ForgeSentinelDetailParams {
  contentEl: HTMLElement;
  mode: ForgeMode;
  callbacks: {
    onBack: () => void;
    onCreateSubmit: (snapshot: ForgeFormSnapshot) => void;
    onUpdateSubmit: (snapshot: ForgeUpdateFormSnapshot) => void;
  };
  defaults: FormDefaults;
  hotkey: {
    directory: HotkeyDirectory;
    eraser: HotkeyEraser;
    /** Only used in update mode — auto-saves a new hotkey to frontmatter on commit. */
    writer?: HotkeyWriter;
  };
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
  #hotkeyCaptureField!: HotkeyCaptureField;
  #submitBtn!: HTMLButtonElement;
  #mode!: ForgeMode;
  #kb: KeyboardController;
  #callbacks!: ForgeSentinelDetailParams['callbacks'];
  #hotkey!: ForgeSentinelDetailParams['hotkey'];

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  constructor(scope: Scope) {
    this.#kb = new KeyboardController(scope);
  }

  render({ contentEl, mode, callbacks, defaults, hotkey }: ForgeSentinelDetailParams): void {
    this.#mode = mode;
    this.#callbacks = callbacks;
    this.#hotkey = hotkey;
    // In update mode with no directives, the checkbox is absent — default to false
    this.#applyCastDirectives = mode.kind === 'update' ? mode.directiveCount > 0 : true;
    this.#buildBackButton(contentEl);

    // Hotkey field: update mode only, above the form, auto-saves on commit
    if (mode.kind === 'update') {
      this.#buildHotkeyCaptureField(contentEl, mode);
    }

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
    this.#submitBtn = this.#buildSubmitButton(form, mode);
    this.#wireSubmitHandler(form);

    this.#descInput.addEventListener('input', this.#handleDescriptionInput);
    this.#handleDescriptionInput();
  }

  /**
   * Release component-owned key bindings on the shared scope and tear down the
   * hotkey capture field's DOM keydown listener.
   * Must be called before the parent re-binds its own keys; otherwise stale
   * ArrowDown/ArrowUp handlers will intercept popup navigation.
   */
  destroy(): void {
    this.#hotkeyCaptureField?.destroy();
    this.#kb.unbindAll();
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  #handleDescriptionInput = (): void => {
    const directiveCount = this.#mode.kind === 'update' ? this.#mode.directiveCount : 0;
    this.#updateSubmitButtonState(this.#descInput.value, this.#applyCastDirectives, directiveCount);
  };

  #handleHotkeyChange = (h: Hotkey | null): void => {
    if (h !== null && this.#hotkey.writer && this.#mode.kind === 'update') {
      void this.#hotkey.writer(this.#mode.spell.path, h);
    }
    // h === null: HotkeyCaptureField already called eraser; nothing extra to do
  };

  #handleExecuteOnNoteChange = (e: Event): void => {
    this.#executeOnNote = (e.target as HTMLInputElement).checked;
  };

  #handleApplyCastDirectivesChange = (e: Event): void => {
    this.#applyCastDirectives = (e.target as HTMLInputElement).checked;
    if (this.#mode.kind === 'update') {
      this.#updateSubmitButtonState(this.#descInput.value, this.#applyCastDirectives, this.#mode.directiveCount);
    }
  };

  #handleModelChange = (): void => {
    this.#currentEffort = null;
    this.#effortRow.update(modelId(this.#modelSelect.value), null);
  };

  #handleEffortChange = (effort: Effort | null): void => {
    this.#currentEffort = effort;
  };

  #handleSubmit = (e: Event): void => {
    e.preventDefault();
    if (this.#mode.kind === 'create') {
      this.#callbacks.onCreateSubmit(this.#snapshotCreate());
    } else {
      this.#callbacks.onUpdateSubmit(this.#snapshotUpdate(this.#mode));
    }
  };

  // ── DOM builders ─────────────────────────────────────────────────────────────

  #buildBackButton(contentEl: HTMLElement): void {
    const nav = contentEl.createDiv({ cls: 'grimoire-nav-bar' });
    const back = nav.createEl('button', { text: '← back' });
    back.type = 'button';
    back.addEventListener('click', this.#callbacks.onBack);
  }

  #buildHotkeyCaptureField(
    container: HTMLElement,
    mode: Extract<ForgeMode, { kind: 'update' }>,
  ): void {
    const initialPersisted = mode.spell.hotkey ?? null;
    const fieldContainer = container.createDiv({ cls: 'grimoire-hotkey-field' });
    this.#hotkeyCaptureField = new HotkeyCaptureField();
    this.#hotkeyCaptureField.render({
      container: fieldContainer,
      initialPersisted,
      selfPath: mode.spell.path,
      directory: this.#hotkey.directory,
      eraser: this.#hotkey.eraser,
      onChange: this.#handleHotkeyChange,
    });
  }

  #buildForm(contentEl: HTMLElement): HTMLFormElement {
    return contentEl.createEl('form', { cls: 'forge-sentinel-form' });
  }

  #buildNameField(form: HTMLElement): HTMLInputElement {
    const setting = new Setting(form).setName('Name');
    let inputEl!: HTMLInputElement;
    setting.addText((text) => {
      text.setPlaceholder('Name');
      inputEl = text.inputEl;
    });
    inputEl.focus();
    return inputEl;
  }

  #buildStaticNameField(form: HTMLElement, spellName: string): void {
    const setting = new Setting(form).setName('Updating spell');
    const div = setting.controlEl.createDiv();
    div.dataset['grimoire'] = 'spell-name';
    div.textContent = spellName;
  }

  #buildDescriptionField(form: HTMLElement, placeholder: string): HTMLTextAreaElement {
    const setting = new Setting(form).setName('Description');
    const textarea = setting.controlEl.createEl('textarea');
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

  #buildExecuteOnNoteCheckbox(form: HTMLElement): void {
    const setting = new Setting(form).setName('Run on active note').addToggle((toggle) => {
      toggle.setValue(true);
    });
    const input = setting.controlEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error('Setting toggle did not render a checkbox (execute-on-note)');
    input.dataset['grimoire'] = 'execute-on-note';
    input.addEventListener('change', this.#handleExecuteOnNoteChange);
  }

  #buildApplyCastDirectivesCheckbox(form: HTMLElement, directiveCount: number): void {
    const noun = directiveCount === 1 ? 'directive' : 'directives';
    const setting = new Setting(form)
      .setName('Apply @cast directives')
      .setDesc(`(${directiveCount} ${noun} found)`)
      .addToggle((toggle) => {
        toggle.setValue(true);
      });
    const input = setting.controlEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error('Setting toggle did not render a checkbox (apply-cast-directives)');
    input.dataset['grimoire'] = 'apply-cast-directives';
    input.addEventListener('change', this.#handleApplyCastDirectivesChange);
  }

  #buildModelSectionHeader(form: HTMLElement): void {
    new Setting(form).setName('Model settings').setHeading();
  }

  #buildModelSelect(form: HTMLElement, defaultModel: ModelId): HTMLSelectElement {
    const setting = new Setting(form).setName('Model');
    return buildModelSelect({
      container: setting.controlEl,
      kb: this.#kb,
      models: SUPPORTED_MODELS,
      initialModel: defaultModel,
      onChange: this.#handleModelChange,
    });
  }

  #resolveInitialEffort(defaults: FormDefaults): Effort | null {
    const initialModel = SUPPORTED_MODELS.find((m) => m.id === defaults.defaultModel);
    return defaults.defaultEffort ?? (initialModel?.defaultEffort ?? null);
  }

  #initEffortRow(form: HTMLElement, defaults: FormDefaults): EffortRow {
    const effortSetting = new Setting(form).setName('Effort');
    const row = new EffortRow();
    row.mount(effortSetting.controlEl, {
      models: SUPPORTED_MODELS,
      modelId: defaults.defaultModel,
      effort: this.#currentEffort,
      onChange: this.#handleEffortChange,
    });
    return row;
  }

  #buildSubmitButton(form: HTMLFormElement, mode: ForgeMode): HTMLButtonElement {
    const buttonRow = form.createDiv({ cls: 'grimoire-button-row' });
    const label = mode.kind === 'create' ? 'Imprint' : 'Submit';
    const submitBtn = buttonRow.createEl('button', { text: label, cls: 'mod-cta' });
    submitBtn.type = 'submit';
    return submitBtn;
  }

  #wireSubmitHandler(form: HTMLFormElement): void {
    form.onsubmit = this.#handleSubmit;
  }

  // ── Data helpers ─────────────────────────────────────────────────────────────

  #snapshotCreate(): ForgeFormSnapshot {
    return {
      name: this.#nameInput.value || '',
      description: this.#descInput.value || '',
      model: modelId(this.#modelSelect.value),
      effort: this.#currentEffort,
      executeOnNote: this.#executeOnNote,
    };
  }

  #snapshotUpdate(mode: Extract<ForgeMode, { kind: 'update' }>): ForgeUpdateFormSnapshot {
    return {
      spellPath: mode.spell.path,
      spellName: mode.spell.name,
      description: this.#descInput.value || '',
      model: modelId(this.#modelSelect.value),
      effort: this.#currentEffort,
      applyCastDirectives: this.#applyCastDirectives,
      directiveCount: mode.directiveCount,
    };
  }

  #updateSubmitButtonState(description: string, applyCastDirectives: boolean, directiveCount: number): void {
    if (this.#mode.kind !== 'update') return;
    const enabled = description.trim().length > 0 || (applyCastDirectives && directiveCount > 0);
    this.#submitBtn.disabled = !enabled;
  }
}
