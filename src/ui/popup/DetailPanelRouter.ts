import { Notice, type App, type Scope } from 'obsidian';
import type { Spell } from '../../domain/spells/Spell';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';
import type { SupportedModel } from '../../domain/settings/Settings';
import type { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import type { ForgeUpdateFormSnapshot } from '../../forge/ForgeUpdateFormSnapshot';
import type { SpellContentReader } from '../../forge/SpellContentReader';
import type { OptionsFormSnapshot } from '../options/OptionsFormState';
import { ForgeSentinelDetail, type HotkeyEraser, type HotkeyWriter } from '../components/ForgeSentinelDetail';
import { OptionsDetail } from '../components/OptionsDetail';
import { countCastDirectives } from '../../forge/castDirectiveExtractor';
import type { ForgeMode } from '../../forge/ForgeMode';
import type { HotkeyDirectory } from '../../forge/HotkeyDirectory';

/** Callback for submitting a Forge sentinel form. */
export type ImprintAction = (snapshot: ForgeFormSnapshot) => void;
/** Callback for casting a spell with resolved options. */
export type CastAction = (spell: Spell, snapshot: OptionsFormSnapshot) => void;
/** Callback for casting the Refine sentinel with resolved options. */
export type RefineCastAction = (snapshot: OptionsFormSnapshot) => void;
/** Callback for updating an existing spell via the Forge update flow. */
export type ForgeUpdateAction = (spell: Spell, snapshot: ForgeUpdateFormSnapshot) => void;

/**
 * Dependencies injected into {@link DetailPanelRouter} at construction time.
 *
 * Callbacks bridge back to the host (`CommandPopup`) for operations that touch
 * host-owned state (keyboard suspension, phase transitions, tab-bar management).
 */
export interface DetailPanelRouterDeps {
  formDefaults: FormDefaults;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  app: App;
  models: readonly SupportedModel[];
  imprintAction: ImprintAction;
  castAction: CastAction;
  refineCastAction: RefineCastAction;
  /** Vault-relative path of the settings-level active Refine spell; null = built-in default. */
  settingsActiveRefinePath: string | null;
  onOverrideChanged: () => void;
  /** Called after constructing a detail component; lets the host enter detail phase. */
  onEnterDetail: (detail: { destroy(): void }, onBack: () => void) => void;
  /** Called when a detail panel's back/submit action exits back to search. */
  onExit: () => void;
  /** Called before rendering each detail panel to clear content and re-pin the tab bar. */
  reattachTabBar: () => void;
  /** Callback invoked when the Forge update form is submitted for an existing spell. */
  forgeUpdateAction: ForgeUpdateAction;
  /** Reads the raw content of a spell file for directive counting. */
  spellContentReader: SpellContentReader;
  /** Factory function that creates a HotkeyDirectory from the current spell list. */
  hotkeyDirectoryFactory: () => HotkeyDirectory;
  /** Callback to erase a hotkey binding for a spell. */
  hotkeyEraser: HotkeyEraser;
  /** Callback to write a hotkey binding to a spell's frontmatter (update mode only). */
  hotkeyWriter: HotkeyWriter;
}

/**
 * Routes "show detail panel" requests from `CommandPopup` to the appropriate
 * detail component (Forge sentinel form, spell-options panel, refine-options panel).
 *
 * Owns no phase or keyboard state — those live on the host (`CommandPopup`).
 * Host interactions are mediated exclusively through the callbacks in
 * {@link DetailPanelRouterDeps}: `onEnterDetail`, `onExit`, `reattachTabBar`.
 */
export class DetailPanelRouter {
  readonly #deps: DetailPanelRouterDeps;
  // Transient render-call context — set at the top of each render method,
  // consumed by the handler arrow fields below.
  #contentEl!: HTMLElement;
  #scope!: Scope;
  #spell!: Spell;

  constructor(deps: DetailPanelRouterDeps) {
    this.#deps = deps;
  }

  // ── Public render methods ────────────────────────────────────────────────────

  /** Renders the Forge sentinel detail form into `contentEl`. */
  renderForge(contentEl: HTMLElement, scope: Scope): void {
    this.#contentEl = contentEl;
    this.#scope = scope;
    this.#deps.reattachTabBar();
    const directory = this.#deps.hotkeyDirectoryFactory();
    const detail = new ForgeSentinelDetail(scope);
    detail.render({
      contentEl,
      mode: { kind: 'create' },
      callbacks: {
        onBack: this.#deps.onExit,
        onCreateSubmit: this.#handleForgeCreateSubmit,
        onUpdateSubmit: this.#noOp,
      },
      defaults: this.#deps.formDefaults,
      hotkey: { directory, eraser: this.#deps.hotkeyEraser },
    });
    this.#deps.onEnterDetail(detail, this.#deps.onExit);
  }

  /** Renders the spell-options detail panel for `spell` into `contentEl`. */
  renderSpellOptions(contentEl: HTMLElement, scope: Scope, spell: Spell): void {
    this.#contentEl = contentEl;
    this.#scope = scope;
    this.#spell = spell;
    this.#deps.reattachTabBar();
    const detail = new OptionsDetail();
    detail.render({
      contentEl,
      scope,
      app: this.#deps.app,
      overrides: this.#deps.overrides,
      sessionMap: this.#deps.sessionMap,
      formDefaults: this.#deps.formDefaults,
      models: this.#deps.models,
      onBack: this.#deps.onExit,
      onCast: this.#handleSpellCast,
      onOverrideChanged: this.#deps.onOverrideChanged,
      kind: { kind: 'spell', spell },
      onForgeUpdate: this.#handleForgeUpdateTransition,
    });
    this.#deps.onEnterDetail(detail, this.#deps.onExit);
  }

  /** Renders the Forge update detail form for an existing `spell` into `contentEl`. */
  async renderForgeUpdate(contentEl: HTMLElement, scope: Scope, spell: Spell): Promise<void> {
    this.#contentEl = contentEl;
    this.#scope = scope;
    this.#spell = spell;
    this.#deps.reattachTabBar();

    // Yield to microtask queue to satisfy test harness (vi.waitFor polling granularity);
    // not required for runtime correctness.
    await Promise.resolve();

    let content: string;
    try {
      content = await this.#deps.spellContentReader.read(spell.path);
    } catch {
      new Notice('Could not read spell content');
      this.#deps.onExit();
      return;
    }

    const directiveCount = countCastDirectives(content);
    const mode: ForgeMode = { kind: 'update', spell, directiveCount };
    const directory = this.#deps.hotkeyDirectoryFactory();

    const detail = new ForgeSentinelDetail(scope);
    detail.render({
      contentEl,
      mode,
      callbacks: {
        onBack: this.#deps.onExit,
        onCreateSubmit: this.#noOp,
        onUpdateSubmit: this.#handleForgeUpdateSubmit,
      },
      defaults: this.#deps.formDefaults,
      hotkey: { directory, eraser: this.#deps.hotkeyEraser, writer: this.#deps.hotkeyWriter },
    });
    this.#deps.onEnterDetail(detail, this.#deps.onExit);
  }

  /** Renders the Refine sentinel options panel into `contentEl`. */
  renderRefineOptions(contentEl: HTMLElement, scope: Scope): void {
    this.#contentEl = contentEl;
    this.#scope = scope;
    this.#deps.reattachTabBar();
    const detail = new OptionsDetail();
    detail.render({
      contentEl,
      scope,
      app: this.#deps.app,
      overrides: this.#deps.overrides,
      sessionMap: this.#deps.sessionMap,
      formDefaults: this.#deps.formDefaults,
      models: this.#deps.models,
      onBack: this.#deps.onExit,
      onCast: this.#handleRefineCast,
      onOverrideChanged: this.#deps.onOverrideChanged,
      kind: { kind: 'refine' },
      settingsActiveRefinePath: this.#deps.settingsActiveRefinePath,
    });
    this.#deps.onEnterDetail(detail, this.#deps.onExit);
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  /** Satisfies a callback slot that is never triggered for the current render mode. */
  #noOp = (): void => {};

  #handleForgeCreateSubmit = (snapshot: ForgeFormSnapshot): void => {
    this.#deps.imprintAction(snapshot);
    this.#deps.onExit();
  };

  #handleSpellCast = (snapshot: OptionsFormSnapshot): void => {
    this.#deps.castAction(this.#spell, snapshot);
  };

  #handleForgeUpdateTransition = (spell: Spell): void => {
    this.#deps.onExit();
    void this.renderForgeUpdate(this.#contentEl, this.#scope, spell);
  };

  #handleForgeUpdateSubmit = (snapshot: ForgeUpdateFormSnapshot): void => {
    this.#deps.forgeUpdateAction(this.#spell, snapshot);
    this.#deps.onExit();
  };

  #handleRefineCast = (snapshot: OptionsFormSnapshot): void => {
    this.#deps.refineCastAction(snapshot);
  };
}
