import { App, Modal } from "obsidian";
import { KeyboardController } from "../infra/KeyboardController";
import type { RankSpells } from "../domain/spells/RankSpells";
import { TabBar } from "./components/TabBar";
import { SearchInput } from "./components/SearchInput";
import type { TabPanel } from "./tabs/TabPanel";
import { isNavigable } from "./tabs/TabPanel";
import { SpellsPanel } from "./tabs/SpellsPanel";
import { CastLogPanel } from "./tabs/CastLogPanel";
import type { CastLogPanelDeps } from "./tabs/CastLogPanel";
import { SUPPORTED_MODELS } from "../domain/settings/Settings";
import type { FormDefaults } from "../domain/settings/FormDefaults";
import { SpellOverrideStore } from "../domain/settings/SpellOverrideStore";
import { OptionsSessionMap } from "./options/OptionsSessionMap";
import { optionsFormSnapshotFromDefaults, optionsFormSnapshotFromRefineDefaults } from "./options/OptionsFormState";
import type { PopupPhase, PopupPhaseContext } from "./popup/PopupPhase";
import { SearchPhase } from "./popup/SearchPhase";
import { DetailPhase } from "./popup/DetailPhase";
import { DetailPanelRouter } from "./popup/DetailPanelRouter";
import type { ImprintAction, CastAction, RefineCastAction } from "./popup/DetailPanelRouter";
export type { ImprintAction, CastAction, RefineCastAction } from "./popup/DetailPanelRouter";

export type { FormDefaults } from "../domain/settings/FormDefaults";

/**
 * Parameters for constructing a CommandPopup.
 * - `app`: Obsidian app instance for workspace and scope.
 * - `spellTag`: Vault tag used to scan spells in the vault.
 * - `imprintAction`: Callback when Forge completes (new spell).
 * - `castAction`: Callback when a spell is cast.
 * - `refineCastAction`: Callback when Refine is cast.
 * - `defaults`: Default form values (model, options per spell).
 * - `overrides`: Per-spell option overrides (persisted, mutable).
 * - `sessionMap`: Ephemeral form state per spell during popup lifetime.
 * - `castLogPanelDeps`: Shared dependencies for the cast log panel.
 */
export interface CommandPopupParams {
  app: App;
  spellTag: string;
  rankSpells: RankSpells;
  imprintAction: ImprintAction;
  castAction: CastAction;
  refineCastAction: RefineCastAction;
  defaults: FormDefaults;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
}

/**
 * Command palette popup: main modal that owns two tabs (Spells, Logs),
 * keyboard navigation, detail-panel routing, and form dismissal logic.
 *
 * Phases (SearchPhase, DetailPhase) govern keyboard handling and close interception.
 * State is reset on each onOpen() (selectedIndex, searchQuery, activePanel).
 * Detail panels (Forge, Options, Refine Options) suspend keyboard and intercept close()
 * to ensure escape/back navigation returns to search instead of closing the modal.
 */
export class CommandPopup extends Modal {
  #selectedIndex = 0;
  #searchQuery = "";
  #panels: readonly TabPanel[];
  #activePanel: TabPanel;
  readonly #spellsPanel: SpellsPanel;
  #tabBar: TabBar | null = null;
  #kb = new KeyboardController(this.scope);
  readonly #rankSpells: RankSpells;
  readonly #imprintAction: ImprintAction;
  readonly #castAction: CastAction;
  readonly #refineCastAction: RefineCastAction;
  readonly #formDefaults: FormDefaults;
  readonly #overrides: SpellOverrideStore;
  readonly #sessionMap: OptionsSessionMap;
  readonly #searchPhase: SearchPhase;
  readonly #detailPhase: DetailPhase;
  #currentPhase: PopupPhase;
  readonly #detailRouter: DetailPanelRouter;

  /**
   * Test seam: exposes #panels for bracket-notation access in tests.
   * In production, phases and keyboard handlers control panel transitions.
   */
  get panels(): readonly TabPanel[] { return this.#panels; }

  /**
   * Test seam: exposes #currentPhase for bracket-notation access in tests.
   * Allows assertions on phase transitions (search → detail → search).
   */
  get currentPhase(): PopupPhase { return this.#currentPhase; }

  constructor(params: CommandPopupParams) {
    super(params.app);
    this.#rankSpells = params.rankSpells;
    this.#imprintAction = params.imprintAction;
    this.#castAction = params.castAction;
    this.#refineCastAction = params.refineCastAction;
    this.#formDefaults = params.defaults;
    this.#overrides = params.overrides;
    this.#sessionMap = params.sessionMap;
    const castLogPanel = new CastLogPanel({
      ...params.castLogPanelDeps,
      openLink: (path) => this.openLink(path),
    });
    this.#spellsPanel = this.#createSpellsPanel(params.spellTag);
    this.#panels = [this.#spellsPanel, castLogPanel];
    this.#activePanel = this.#panels[0];

    const ctx: PopupPhaseContext = {
      activePanel: () => this.#activePanel,
      selectedIndex: () => this.#selectedIndex,
      setSelectedIndex: (i) => { this.#selectedIndex = i; },
      setActivePanel: (panel) => { this.#activePanel = panel; },
      spellsPanel: () => this.#spellsPanel,
      panels: () => this.#panels,
      kb: () => this.#kb,
      contentEl: () => this.contentEl,
      exitDetail: () => this.#exitDetail(),
      renderSearch: () => this.#render(),
    };
    this.#searchPhase = new SearchPhase(ctx);
    this.#detailPhase = new DetailPhase(ctx);
    this.#currentPhase = this.#searchPhase;
    this.#detailRouter = new DetailPanelRouter({
      formDefaults: this.#formDefaults,
      overrides: this.#overrides,
      sessionMap: this.#sessionMap,
      app: this.app,
      models: SUPPORTED_MODELS,
      imprintAction: this.#imprintAction,
      castAction: this.#castAction,
      refineCastAction: this.#refineCastAction,
      onOverrideChanged: () => this.#spellsPanel.refreshOverrides(),
      onEnterDetail: (detail, onBack) => this.#enterDetail(detail, onBack),
      onExit: () => this.#exitDetail(),
      reattachTabBar: () => this.#reattachTabBar(),
    });
  }

  openLink(path: string): void {
    void this.app.workspace.openLinkText(path, '', false);
    this.close();
  }

  onOpen(): void {
    this.#selectedIndex = 0;
    this.#searchQuery = "";
    this.#activePanel = this.#panels[0];
    this.#currentPhase = this.#searchPhase;
    this.#panels.forEach((p) => { if (isNavigable(p)) p.reset(); });
    this.#render();
    this.#bindKeys();
  }

  #bindKeys(): void {
    this.#kb.bind([], "ArrowDown", () => this.#currentPhase.handleArrow(1));
    this.#kb.bind([], "ArrowUp", () => this.#currentPhase.handleArrow(-1));
    this.#kb.bind([], "Enter", () => this.#currentPhase.handleEnter());
    this.#kb.bind([], "Tab", () => this.#currentPhase.handleTab());
    this.#kb.bind([], "ArrowRight", () => this.#currentPhase.handleArrowRight());
  }

  /**
   * Fully closes the modal regardless of current phase, bypassing the
   * close-override intercept. Required for paths that must dismiss the modal
   * unconditionally (e.g. Cast inside the Refine options panel). The
   * authored-spell cast path still uses `close()` so the intercept routes it
   * back to search.
   */
  dismiss(): void {
    super.close();
  }

  // Obsidian's scope system and subcomponents can call close() directly,
  // bypassing keyboard handlers — intercept here to enforce phase navigation.
  override close(): void {
    if (this.#currentPhase.interceptClose()) return;
    super.close();
  }

  onClose(): void {
    this.#panels.forEach((p) => p.unmount?.());
    this.contentEl.empty();
  }

  #render(): void {
    this.contentEl.empty();
    this.#tabBar = this.#createTabBar();
    this.#renderSearch();
  }

  #createTabBar(): TabBar {
    const bar = new TabBar();
    bar.render(
      this.contentEl,
      this.#panels.map((p) => p.id),
      this.#activePanel.id,
      this.#currentPhase.disablesTabBar(),
      (id) => {
        const panel = this.#panels.find((p) => p.id === id);
        if (panel) this.#switchTab(panel);
      }
    );
    return bar;
  }

  #createSpellsPanel(spellTag: string): SpellsPanel {
    const panel = new SpellsPanel(this.app, spellTag, this.#rankSpells);
    panel.setHasOverride((path) => this.#overrides.has(path));
    panel.events.on("cast", (spell) => {
      const snapshot = optionsFormSnapshotFromDefaults(this.#formDefaults, spell);
      this.#castAction(spell, snapshot);
    });
    panel.events.on("sentinel", () => this.#detailRouter.renderForge(this.contentEl, this.scope));
    panel.events.on("open-options", (spell) => this.#detailRouter.renderSpellOptions(this.contentEl, this.scope, spell));
    panel.events.on("open-refine-options", () => this.#detailRouter.renderRefineOptions(this.contentEl, this.scope));
    panel.events.on("refine-cast", () => {
      const snapshot = optionsFormSnapshotFromRefineDefaults(
        this.#formDefaults,
        this.#overrides,
        this.#sessionMap,
        SUPPORTED_MODELS,
      );
      this.#refineCastAction(snapshot);
    });
    return panel;
  }

  #renderSearch(): void {
    this.#reattachTabBar();
    this.#mountActivePanel();
  }

  #reattachTabBar(): void {
    const barEl = this.#tabBar?.el;
    this.contentEl.empty();
    if (barEl) this.contentEl.appendChild(barEl);
  }

  #mountActivePanel(): void {
    if (isNavigable(this.#activePanel)) {
      new SearchInput().render(this.contentEl, this.#activePanel, this.#searchQuery, this.#selectedIndex, (query, idx) => {
        this.#searchQuery = query;
        this.#selectedIndex = idx;
      });
    }
    this.#activePanel.mount(this.contentEl);
  }

  #exitDetail(): void {
    this.#currentPhase = this.#searchPhase;
    this.#kb.resume();
    this.#renderSearch();
  }

  /**
   * Enter detail (Forge/Options/Refine panel) from search.
   * Suspends global keyboard navigation to allow form inputs to receive key events.
   * DetailPhase still intercepts Escape via close().
   */
  #enterDetail(detail: { destroy(): void }, onBack: () => void): void {
    this.#kb.suspend();
    this.#currentPhase = this.#detailPhase;
    this.#detailPhase.setActive(detail, onBack);
  }

  #switchTab(panel: TabPanel): void {
    // Tear down the outgoing panel before swapping — otherwise re-entering it
    // (Spells → Logs → Spells) re-runs mount() on a panel that's still
    // holding live coordinators (e.g. CastLogPanel re-starting an already-
    // started VaultRefreshCoordinator).
    this.#activePanel.unmount?.();
    this.#activePanel = panel;
    this.#searchQuery = "";
    this.#selectedIndex = 0;
    if (isNavigable(panel)) panel.reset();
    this.#render();
  }
}
