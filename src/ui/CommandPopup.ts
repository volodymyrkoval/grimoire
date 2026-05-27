import { App, Modal, Notice } from "obsidian";
import { KeyboardController } from "../infra/KeyboardController";
import type { RankSpells } from "../domain/spells/RankSpells";
import type { Spell } from "../domain/spells/Spell";
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
import { optionsFormSnapshotFromRefineDefaults } from "./options/OptionsFormState";
import type { PopupPhase, PopupPhaseContext } from "./popup/PopupPhase";
import { SearchPhase } from "./popup/SearchPhase";
import { DetailPhase } from "./popup/DetailPhase";
import { DetailPanelRouter } from "./popup/DetailPanelRouter";
import type { ImprintAction, CastAction, RefineCastAction, ForgeUpdateAction } from "./popup/DetailPanelRouter";
import type { SpellContentReader } from "../forge/SpellContentReader";
import { HotkeyRegistry } from "./popup/hotkey/HotkeyRegistry";
import { HotkeyBuffer } from "./popup/hotkey/HotkeyBuffer";
import { HotkeyCapture } from "./popup/hotkey/HotkeyCapture";
import type { BufferState } from "./popup/hotkey/HotkeyBuffer";
import { HotkeyHintSlot } from "./components/HotkeyHintSlot";
import { buildHotkeyDirectory } from "../forge/HotkeyDirectory";
import type { HotkeyEraser, HotkeyWriter } from "./components/HotkeyTypes";
import type { CastingFrontmatterReader, CastingFrontmatterWriter } from "../infra/castingFrontmatter";
import type { ModelId } from "../domain/settings/ModelId";
import type { Effort } from "../domain/settings/Settings";
import { resolveCastingForSpell } from "../domain/settings/resolveCastingForSpell";
import { CLAUDE_CODE_PROVIDER } from "../domain/settings/CastingSettings";
export type { ImprintAction, CastAction, RefineCastAction, ForgeUpdateAction } from "./popup/DetailPanelRouter";

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
 * - `settingsActiveRefinePath`: Vault-relative path of the settings-level active Refine spell;
 *   used to pre-select the variant dropdown when no per-session override exists. Optional — omitting
 *   it is equivalent to passing `null` (no custom active Refine).
 * - `hotkeyEraser`: Callback to delete a hotkey binding from a spell's frontmatter.
 * - `hotkeyWriter`: Callback to write a hotkey binding to a spell's frontmatter.
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
  /** Vault-relative path of the settings-level active Refine spell; null = built-in default. */
  settingsActiveRefinePath?: string | null;
  /** Callback invoked when the Forge update form is submitted for an existing spell. */
  forgeUpdateAction: ForgeUpdateAction;
  /** Reads the raw content of a spell file for directive counting during Forge update. */
  spellContentReader: SpellContentReader;
  /** Callback to erase a hotkey binding from a spell's frontmatter. */
  hotkeyEraser: HotkeyEraser;
  /** Callback to write a hotkey binding to a spell's frontmatter (update mode only). */
  hotkeyWriter: HotkeyWriter;
  /** Reads spell-local casting settings from a spell file's frontmatter. */
  reader: CastingFrontmatterReader;
  /** Writes spell-local casting settings to a spell file's frontmatter (on Cast). */
  castingWriter: CastingFrontmatterWriter;
  /** Writes vault-wide default model/effort to plugin settings. */
  setVaultDefault: (model: ModelId, effort: Effort | null) => void;
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
  readonly #forgeUpdateAction: ForgeUpdateAction;
  readonly #spellContentReader: SpellContentReader;
  readonly #spellTag: string;
  readonly #hotkeyEraser: HotkeyEraser;
  readonly #hotkeyWriter: HotkeyWriter;
  readonly #reader: CastingFrontmatterReader;
  readonly #castingWriter: CastingFrontmatterWriter;
  readonly #setVaultDefault: (model: ModelId, effort: Effort | null) => void;
  #hotkeyBuffer: HotkeyBuffer = new HotkeyBuffer();
  #hotkeyCapture: HotkeyCapture | null = null;
  #hintSlot: HotkeyHintSlot | null = null;
  #hotkeyChangedInDetailPanel = false;
  /**
   * Persistent container element for HotkeyHintSlot, created once in onOpen()
   * and re-appended into each new tab bar's right-slot div on every #render().
   * Keeping one container alive means the slot instance never needs replacement.
   */
  #hintSlotContainer: HTMLElement | null = null;
  /** Guards the collision Notice so it fires at most once per popup session. */
  #hasShownCollisionNotice = false;

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
    this.#forgeUpdateAction = params.forgeUpdateAction;
    this.#spellContentReader = params.spellContentReader;
    this.#spellTag = params.spellTag;
    this.#hotkeyEraser = params.hotkeyEraser;
    this.#hotkeyWriter = params.hotkeyWriter;
    this.#reader = params.reader;
    this.#castingWriter = params.castingWriter;
    this.#setVaultDefault = params.setVaultDefault;
    const castLogPanel = new CastLogPanel({
      ...params.castLogPanelDeps,
      openLink: this.#handleOpenLink,
      app: params.app,
    });
    this.#spellsPanel = this.#createSpellsPanel(params.spellTag);
    this.#panels = [this.#spellsPanel, castLogPanel];
    this.#activePanel = this.#panels[0];

    const ctx = this.#buildPhaseContext();
    this.#searchPhase = new SearchPhase(ctx);
    this.#detailPhase = new DetailPhase(ctx);
    this.#currentPhase = this.#searchPhase;
    this.#detailRouter = this.#buildRouter(params);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onOpen(): void {
    this.#selectedIndex = 0;
    this.#searchQuery = "";
    this.#activePanel = this.#panels[0];
    this.#currentPhase = this.#searchPhase;
    // refreshSpells returns the scanned spell list so #buildHotkeyCapture can
    // reuse it without triggering a second vault scan.
    const spells = this.#spellsPanel.refreshSpells(this.app, this.#spellTag);
    this.#panels.forEach((p) => { if (isNavigable(p)) p.reset(); });
    this.#buildHotkeyCapture(spells);
    // Reset hint slot so #createTabBar() initialises it fresh for this open.
    this.#hintSlot = null;
    this.#hintSlotContainer = null;
    this.#render();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.#hintSlot?.renderHint();
    this.#bindKeys();
    this.#hotkeyCapture?.install();
  }

  onClose(): void {
    this.#spellsPanel.events.off("cast", this.#handleSpellCast);
    this.#spellsPanel.events.off("sentinel", this.#handleOpenSentinel);
    this.#spellsPanel.events.off("open-options", this.#handleOpenSpellOptions);
    this.#spellsPanel.events.off("open-refine-options", this.#handleOpenRefineOptions);
    this.#spellsPanel.events.off("refine-cast", this.#handleRefineCast);
    this.#panels.forEach((p) => p.unmount?.());
    this.contentEl.empty();
  }

  // Obsidian's scope system and subcomponents can call close() directly,
  // bypassing keyboard handlers — intercept here to enforce phase navigation
  // and to absorb Escape while a hotkey sequence is in progress.
  //
  // Why the buffer check lives here (not only in the #bindKeys() Escape handler):
  // real Obsidian's Modal binds Escape→this.close() inside its constructor (before
  // onOpen() runs), and Scope dispatches FIFO. The built-in handler therefore runs
  // first and calls close() directly — our #bindKeys() Escape binding is never
  // reached. Intercepting here is the single chokepoint that catches all close()
  // entry paths (built-in Escape, programmatic, sub-component dismiss).
  override close(): void {
    if (this.#hotkeyBuffer.state().status !== 'empty') {
      this.#hotkeyBuffer.clear();
      return;
    }
    if (this.#currentPhase.interceptClose()) return;
    super.close();
  }

  openLink(path: string): void {
    void this.app.workspace.openLinkText(path, '', false);
    this.close();
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

  // ── Build methods ────────────────────────────────────────────────────────────

  #buildPhaseContext(): PopupPhaseContext {
    return {
      activePanel: () => this.#activePanel,
      selectedIndex: () => this.#selectedIndex,
      setSelectedIndex: (i) => { this.#selectedIndex = i; },
      setActivePanel: (panel) => { this.#activePanel = panel; },
      spellsPanel: () => this.#spellsPanel,
      panels: () => this.#panels,
      kb: () => this.#kb,
      contentEl: () => this.contentEl,
      exitDetail: this.#exitDetail,
      renderSearch: this.#render,
      switchTab: (panel) => { this.#switchTab(panel); },
    };
  }

  #buildRouter(params: CommandPopupParams): DetailPanelRouter {
    return new DetailPanelRouter({
      formDefaults: this.#formDefaults,
      overrides: this.#overrides,
      sessionMap: this.#sessionMap,
      app: this.app,
      models: SUPPORTED_MODELS,
      imprintAction: this.#imprintAction,
      castAction: this.#castAction,
      refineCastAction: this.#refineCastAction,
      settingsActiveRefinePath: params.settingsActiveRefinePath ?? null,
      onOverrideChanged: this.#handleOverrideChanged,
      onEnterDetail: this.#enterDetail,
      onExit: this.#exitDetail,
      reattachTabBar: this.#reattachTabBar,
      forgeUpdateAction: this.#forgeUpdateAction,
      spellContentReader: this.#spellContentReader,
      reader: this.#reader,
      castingWriter: this.#castingWriter,
      setVaultDefault: this.#setVaultDefault,
      hotkeyDirectoryFactory: this.#buildCurrentHotkeyDirectory,
      hotkeyEraser: this.#eraseHotkeyAndMarkChanged,
      hotkeyWriter: this.#writeHotkeyAndMarkChanged,
    });
  }

  #createSpellsPanel(spellTag: string): SpellsPanel {
    const panel = new SpellsPanel(this.app, spellTag, this.#rankSpells);
    panel.setHasOverride(this.#handleHasOverride);
    panel.events.on("cast", this.#handleSpellCast);
    panel.events.on("sentinel", this.#handleOpenSentinel);
    panel.events.on("open-options", this.#handleOpenSpellOptions);
    panel.events.on("open-refine-options", this.#handleOpenRefineOptions);
    panel.events.on("refine-cast", this.#handleRefineCast);
    return panel;
  }

  /**
   * Rebuilds the HotkeyBuffer, HotkeyRegistry, and HotkeyCapture on each popup open.
   * Accepts the already-scanned spell list from refreshSpells() to avoid a second
   * vault scan.
   */
  #buildHotkeyCapture(spells: readonly Spell[]): void {
    this.#hotkeyCapture?.uninstall();
    this.#hotkeyBuffer = new HotkeyBuffer();
    this.#hotkeyBuffer.on('change', this.#onBufferChange);
    const { registry, collisions } = HotkeyRegistry.build(spells, this.#spellsPanel.sentinels());
    if (collisions.dropped.length > 0 && !this.#hasShownCollisionNotice) {
      const list = collisions.dropped
        .map((d) => `'${d.hotkey}' on '${d.ownerName}' (${d.reason})`)
        .join(', ');
      new Notice(`Hotkey collisions: ${list}`);
      this.#hasShownCollisionNotice = true;
    }
    this.#hotkeyCapture = new HotkeyCapture({
      kb: this.#kb,
      buffer: this.#hotkeyBuffer,
      registry,
      focusRow: this.#focusRow,
    });
  }

  #bindKeys(): void {
    this.#kb.bind([], "ArrowDown", this.#handleArrowDown);
    this.#kb.bind([], "ArrowUp", this.#handleArrowUp);
    this.#kb.bind([], "Enter", this.#handleEnter);
    this.#kb.bind([], "Tab", this.#handleTab);
    this.#kb.bind([], "ArrowRight", this.#handleArrowRight);
    // Defensive Escape binding: in real Obsidian, Modal's built-in Escape→close()
    // (registered FIFO from the constructor) fires first and routes through our
    // close() override — which already handles the non-empty-buffer case. This
    // binding remains for environments where no earlier Escape handler exists
    // (e.g. unit tests that don't simulate the built-in handler).
    this.#kb.bind([], "Escape", this.#handleEscape);
  }

  // ── Rendering & navigation ───────────────────────────────────────────────────

  #render = (): void => {
    this.contentEl.empty();
    this.#tabBar = this.#createTabBar();
    this.#renderSearch();
  };

  #renderSearch(): void {
    this.#reattachTabBar();
    this.#mountActivePanel();
  }

  #reattachTabBar = (): void => {
    const barEl = this.#tabBar?.el;
    this.contentEl.empty();
    if (barEl) this.contentEl.appendChild(barEl);
  };

  #mountActivePanel(): void {
    if (isNavigable(this.#activePanel)) {
      new SearchInput().render(this.contentEl, this.#activePanel, this.#searchQuery, this.#selectedIndex, this.#handleSearchInput);
    }
    this.#activePanel.mount(this.contentEl);
  }

  #createTabBar(): TabBar {
    const bar = new TabBar();
    bar.render(
      this.contentEl,
      this.#panels.map((p) => p.id),
      this.#activePanel.id,
      this.#currentPhase.disablesTabBar(),
      this.#handleTabSwitch,
      /* withRightSlot */ true,
    );
    if (bar.rightSlotEl) {
      if (this.#hintSlot && this.#hintSlotContainer) {
        // Reuse the existing slot — move its container into the new tab bar's
        // right-slot div so the slot instance (and its rendered content) survives
        // across #render() calls within the same popup session.
        bar.rightSlotEl.appendChild(this.#hintSlotContainer);
      } else {
        // First render of this popup session: create the slot once.
        this.#hintSlotContainer = bar.rightSlotEl.createDiv();
        this.#hintSlot = new HotkeyHintSlot({
          container: this.#hintSlotContainer,
          onClear: this.#handleHintSlotClear,
        });
      }
    }
    return bar;
  }

  /**
   * Enter detail (Forge/Options/Refine panel) from search.
   * Suspends global keyboard navigation to allow form inputs to receive key events.
   * DetailPhase still intercepts Escape via close().
   */
  #enterDetail = (detail: { destroy(): void }, onBack: () => void): void => {
    this.#hotkeyBuffer.clear();
    this.#hintSlot?.hide();
    this.#kb.suspend();
    this.#currentPhase = this.#detailPhase;
    this.#detailPhase.setActive(detail, onBack);
  };

  // Symmetric teardown for every detail handoff (detail → search or detail →
  // detail). DetailPhase.clearActive() destroys the outgoing detail so its
  // component-owned keyboard bindings cannot leak onto Modal.scope past their
  // owner's lifetime. Idempotent — safe when clearActive has already run via
  // DetailPhase.interceptClose (Escape path).
  #exitDetail = (): void => {
    this.#leaveDetailState();
    if (this.#hotkeyChangedInDetailPanel) {
      this.#hotkeyChangedInDetailPanel = false;
      const spells = this.#spellsPanel.refreshSpells(this.app, this.#spellTag);
      this.#buildHotkeyCapture(spells);
    }
    this.#renderSearch();
    // Restore hint slot only when returning to the Spells tab.
    if (this.#activePanel === this.#panels[0]) {
      this.#hintSlot?.renderHint();
    }
  };

  // Phase-and-keyboard half of the detail-exit transition, with no rendering.
  // Used by #exitDetail (which then re-renders search) and by #switchTab (which
  // re-renders the newly-active tab itself). Splitting avoids a double render
  // and avoids rendering the search phase while the tab is actually switching
  // to Logs.
  #leaveDetailState(): void {
    this.#detailPhase.clearActive();
    this.#currentPhase = this.#searchPhase;
    this.#kb.resume();
  }

  #switchTab(panel: TabPanel): void {
    // Exit detail phase first — a tab click while a detail panel is open must
    // dismiss the detail before re-rendering, otherwise #render() rebuilds the
    // tab bar with disablesTabBar()=true (both tabs dimmed and click-gated) and
    // leaves the keyboard scope suspended — a fully frozen popup. resume()
    // must precede the unmount/render below so the 26 Shift+letter bindings
    // are live for hotkeyCapture.uninstall() to tear down cleanly.
    if (this.#currentPhase === this.#detailPhase) {
      this.#leaveDetailState();
    }
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
    // Update capture installation and hint slot visibility based on active tab.
    if (panel === this.#panels[0]) {
      this.#hotkeyCapture?.install();
      this.#hotkeyBuffer.clear();
      this.#hintSlot?.renderHint();
    } else {
      this.#hotkeyCapture?.uninstall();
      this.#hintSlot?.hide();
    }
  }

  /**
   * Focuses the given global row index in the spells panel.
   * Clears the search query first so filtered-out rows become visible,
   * then delegates selection update to SpellsPanel.focusByRowIndex.
   */
  #focusRow = (index: number): void => {
    this.#searchQuery = '';
    this.#spellsPanel.reset();
    this.#selectedIndex = index;
    this.#render();
    this.#spellsPanel.focusByRowIndex(index);
  };

  // ── Event handlers ───────────────────────────────────────────────────────────

  /**
   * Reacts to HotkeyBuffer state changes.
   * Delegates rendering to HotkeyHintSlot based on the new state.
   */
  #onBufferChange = (state: BufferState): void => {
    if (!this.#hintSlot) return;
    if (state.status === 'empty') {
      // Only show hint when on Spells tab
      if (this.#activePanel === this.#panels[0]) {
        this.#hintSlot.renderHint();
      }
    } else {
      this.#hintSlot.renderIndicator(state.letters, state.status);
    }
  };

  #handleOpenLink = (path: string): void => {
    this.openLink(path);
  };

  #handleOverrideChanged = (): void => {
    this.#spellsPanel.refreshOverrides();
  };

  #buildCurrentHotkeyDirectory = () => buildHotkeyDirectory(this.#spellsPanel.spells());

  #eraseHotkeyAndMarkChanged = async (...args: Parameters<HotkeyEraser>): Promise<void> => {
    await this.#hotkeyEraser(...args);
    this.#hotkeyChangedInDetailPanel = true;
  };

  #writeHotkeyAndMarkChanged = async (...args: Parameters<HotkeyWriter>): Promise<void> => {
    await this.#hotkeyWriter(...args);
    this.#hotkeyChangedInDetailPanel = true;
  };

  #handleHasOverride = (path: Parameters<SpellOverrideStore['has']>[0]): boolean =>
    this.#reader(path) !== null;

  #handleSpellCast = (spell: Spell): void => {
    const parsed = this.#reader(spell.path);
    const { model, effort, provider } = resolveCastingForSpell({
      parsed,
      defaults: this.#formDefaults,
      models: SUPPORTED_MODELS,
      knownProvider: CLAUDE_CODE_PROVIDER,
    });
    this.#castAction(spell, { model, effort, provider, contextNotePaths: [], followUp: '', executeOnNote: spell.executeOnNote });
  };

  #handleOpenSentinel = (): void => {
    this.#detailRouter.renderForge(this.contentEl, this.scope);
  };

  #handleOpenSpellOptions = (spell: Spell): void => {
    this.#detailRouter.renderSpellOptions(this.contentEl, this.scope, spell);
  };

  #handleOpenRefineOptions = (): void => {
    this.#detailRouter.renderRefineOptions(this.contentEl, this.scope);
  };

  #handleRefineCast = (): void => {
    const snapshot = optionsFormSnapshotFromRefineDefaults(
      this.#formDefaults,
      this.#overrides,
      this.#sessionMap,
      SUPPORTED_MODELS,
    );
    this.#refineCastAction(snapshot);
  };

  #handleArrowDown = (): boolean => {
    if (this.#hotkeyBuffer.state().status !== 'empty') this.#hotkeyBuffer.clear();
    return this.#currentPhase.handleArrow(1);
  };

  #handleArrowUp = (): boolean => {
    if (this.#hotkeyBuffer.state().status !== 'empty') this.#hotkeyBuffer.clear();
    return this.#currentPhase.handleArrow(-1);
  };

  #handleEnter = (): boolean => this.#currentPhase.handleEnter();

  #handleTab = (): boolean => this.#currentPhase.handleTab();

  #handleArrowRight = (): boolean => this.#currentPhase.handleArrowRight();

  #handleEscape = (): boolean => {
    this.close();
    return true;
  };

  #handleTabSwitch = (id: string): void => {
    const panel = this.#panels.find((p) => p.id === id);
    if (panel) this.#switchTab(panel);
  };

  #handleHintSlotClear = (): void => {
    this.#hotkeyBuffer.clear();
  };

  #handleSearchInput = (query: string, idx: number): void => {
    this.#searchQuery = query;
    this.#selectedIndex = idx;
    this.#hotkeyBuffer.clear();
  };
}
