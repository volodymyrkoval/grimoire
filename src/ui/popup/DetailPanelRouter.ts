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
import { ForgeSentinelDetail } from '../components/ForgeSentinelDetail';
import { OptionsDetail } from '../components/OptionsDetail';
import { countCastDirectives } from '../../forge/castDirectiveExtractor';
import type { ForgeMode } from '../../forge/ForgeMode';

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

  constructor(deps: DetailPanelRouterDeps) {
    this.#deps = deps;
  }

  /** Renders the Forge sentinel detail form into `contentEl`. */
  renderForge(contentEl: HTMLElement, scope: Scope): void {
    this.#deps.reattachTabBar();
    const exit = (): void => this.#deps.onExit();
    const detail = new ForgeSentinelDetail(scope);
    detail.render({
      contentEl,
      mode: { kind: 'create' },
      callbacks: {
        onBack: exit,
        onCreateSubmit: (snapshot) => {
          this.#deps.imprintAction(snapshot);
          exit();
        },
        onUpdateSubmit: () => { /* update path not wired in create-only router */ },
      },
      defaults: this.#deps.formDefaults,
    });
    this.#deps.onEnterDetail(detail, exit);
  }

  /** Renders the spell-options detail panel for `spell` into `contentEl`. */
  renderSpellOptions(contentEl: HTMLElement, scope: Scope, spell: Spell): void {
    this.#deps.reattachTabBar();
    const exit = (): void => this.#deps.onExit();
    const detail = new OptionsDetail();
    detail.render({
      contentEl,
      scope,
      app: this.#deps.app,
      overrides: this.#deps.overrides,
      sessionMap: this.#deps.sessionMap,
      formDefaults: this.#deps.formDefaults,
      models: this.#deps.models,
      onBack: exit,
      onCast: (snap) => this.#deps.castAction(spell, snap),
      onOverrideChanged: this.#deps.onOverrideChanged,
      kind: { kind: 'spell', spell },
      onForgeUpdate: (s) => {
        exit();
        void this.renderForgeUpdate(contentEl, scope, s);
      },
    });
    this.#deps.onEnterDetail(detail, exit);
  }

  /** Renders the Forge update detail form for an existing `spell` into `contentEl`. */
  async renderForgeUpdate(contentEl: HTMLElement, scope: Scope, spell: Spell): Promise<void> {
    this.#deps.reattachTabBar();
    const exit = (): void => this.#deps.onExit();

    // Yield to microtask queue to satisfy test harness (vi.waitFor polling granularity);
    // not required for runtime correctness.
    await Promise.resolve();

    let content: string;
    try {
      content = await this.#deps.spellContentReader.read(spell.path);
    } catch {
      new Notice('Could not read spell content');
      exit();
      return;
    }

    const directiveCount = countCastDirectives(content);
    const mode: ForgeMode = { kind: 'update', spell, directiveCount };

    const detail = new ForgeSentinelDetail(scope);
    detail.render({
      contentEl,
      mode,
      callbacks: {
        onBack: exit,
        onCreateSubmit: () => { /* never called in update mode */ },
        onUpdateSubmit: (snapshot) => {
          this.#deps.forgeUpdateAction(spell, snapshot);
          exit();
        },
      },
      defaults: this.#deps.formDefaults,
    });
    this.#deps.onEnterDetail(detail, exit);
  }

  /** Renders the Refine sentinel options panel into `contentEl`. */
  renderRefineOptions(contentEl: HTMLElement, scope: Scope): void {
    this.#deps.reattachTabBar();
    const exit = (): void => this.#deps.onExit();
    const detail = new OptionsDetail();
    detail.render({
      contentEl,
      scope,
      app: this.#deps.app,
      overrides: this.#deps.overrides,
      sessionMap: this.#deps.sessionMap,
      formDefaults: this.#deps.formDefaults,
      models: this.#deps.models,
      onBack: exit,
      onCast: (snap) => this.#deps.refineCastAction(snap),
      onOverrideChanged: this.#deps.onOverrideChanged,
      kind: { kind: 'refine' },
      settingsActiveRefinePath: this.#deps.settingsActiveRefinePath,
    });
    this.#deps.onEnterDetail(detail, exit);
  }
}
