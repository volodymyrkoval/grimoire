import { App, Modal } from "obsidian";
import { KeyboardController } from "../infra/KeyboardController";
import type { Spell, Sentinel } from "../domain/spells/Spell";
import { TabBar } from "./components/TabBar";
import { SearchInput } from "./components/SearchInput";
import { ForgeSentinelDetail } from "./components/ForgeSentinelDetail";
import type { TabPanel } from "./tabs/TabPanel";
import { isNavigable } from "./tabs/TabPanel";
import { SpellsPanel } from "./tabs/SpellsPanel";
import { CastLogPanel } from "./tabs/CastLogPanel";
import type { CastLogPanelDeps } from "./tabs/CastLogPanel";
import type { ForgeFormSnapshot } from "../forge/ForgeFormSnapshot";
import { SUPPORTED_MODELS } from "../domain/settings/Settings";
import type { FormDefaults } from "../domain/settings/FormDefaults";
import { SpellOverrideStore } from "../domain/settings/SpellOverrideStore";
import { OptionsSessionMap } from "./options/OptionsSessionMap";
import type { OptionsFormSnapshot } from "./options/OptionsFormState";
import { optionsFormSnapshotFromDefaults } from "./options/OptionsFormState";
import { SpellOptionsDetail } from "./components/SpellOptionsDetail";
import type { PopupPhase, PopupPhaseContext } from "./popup/PopupPhase";
import { SearchPhase } from "./popup/SearchPhase";
import { DetailPhase } from "./popup/DetailPhase";

/** Callback signature for submitting a Forge sentinel form. */
export type ImprintAction = (snapshot: ForgeFormSnapshot) => void;

/** Callback signature for casting a spell with resolved options. */
export type CastAction = (spell: Spell, snapshot: OptionsFormSnapshot) => void;

export type { FormDefaults } from "../domain/settings/FormDefaults";

export interface CommandPopupParams {
  app: App;
  spellTag: string;
  imprintAction: ImprintAction;
  castAction: CastAction;
  defaults: FormDefaults;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
}

/**
 * Command palette popup: main modal that owns two tabs (Spells, Logs),
 * keyboard navigation, detail-panel routing, and form dismissal logic.
 * Phases (SearchPhase, DetailPhase) govern keyboard handling and close interception.
 */
export class CommandPopup extends Modal {
  #selectedIndex = 0;
  #searchQuery = "";
  #panels: readonly TabPanel[];
  #activePanel: TabPanel;
  readonly #spellsPanel: SpellsPanel;
  #tabBar: TabBar | null = null;
  #kb = new KeyboardController(this.scope);
  readonly #imprintAction: ImprintAction;
  readonly #castAction: CastAction;
  readonly #formDefaults: FormDefaults;
  readonly #overrides: SpellOverrideStore;
  readonly #sessionMap: OptionsSessionMap;
  readonly #searchPhase: SearchPhase;
  readonly #detailPhase: DetailPhase;
  #currentPhase: PopupPhase;

  // test seam — exposes #panels for bracket-notation access in tests
  get panels(): readonly TabPanel[] { return this.#panels; }

  // test seam — exposes #currentPhase for bracket-notation access in tests
  get currentPhase(): PopupPhase { return this.#currentPhase; }

  constructor(params: CommandPopupParams) {
    super(params.app);
    this.#imprintAction = params.imprintAction;
    this.#castAction = params.castAction;
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
      this.#currentPhase.kind === 'detail',
      (id) => {
        const panel = this.#panels.find((p) => p.id === id);
        if (panel) this.#switchTab(panel);
      }
    );
    return bar;
  }

  #createSpellsPanel(spellTag: string): SpellsPanel {
    const panel = new SpellsPanel(this.app, spellTag);
    panel.setHasOverride((path) => this.#overrides.has(path));
    panel.events.on("cast", (spell) => {
      const snapshot = optionsFormSnapshotFromDefaults(this.#formDefaults, spell);
      this.#castAction(spell, snapshot);
    });
    panel.events.on("sentinel", (sentinel) => this.#renderSentinelDetail(sentinel));
    panel.events.on("open-options", (spell) => this.#renderOptionsPanel(spell));
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

  #enterDetail(detail: { destroy(): void }, onBack: () => void, opts: { suspendKb: boolean }): void {
    if (opts.suspendKb) this.#kb.suspend();
    this.#currentPhase = this.#detailPhase;
    this.#detailPhase.setActive(detail, onBack);
  }

  #renderSentinelDetail(sentinel: Sentinel): void {
    this.#reattachTabBar();

    if (sentinel.kind === "forge") {
      this.#renderForgeSentinelDetail();
    } else {
      this.#renderGenericSentinelDetail(sentinel);
    }
  }

  #renderForgeSentinelDetail(): void {
    const exit = (): void => this.#exitDetail();
    const detail = new ForgeSentinelDetail(this.scope);
    detail.render({
      contentEl: this.contentEl,
      callbacks: {
        onBack: exit,
        onSubmit: (snapshot) => {
          this.#imprintAction(snapshot);
          exit();
        },
      },
      defaults: this.#formDefaults,
    });
    this.#enterDetail(detail, exit, { suspendKb: true });
  }

  #renderOptionsPanel(spell: Spell): void {
    this.#reattachTabBar();
    const exit = (): void => this.#exitDetail();
    const detail = new SpellOptionsDetail();
    detail.render({
      contentEl: this.contentEl,
      scope: this.scope,
      spell,
      app: this.app,
      overrides: this.#overrides,
      sessionMap: this.#sessionMap,
      formDefaults: this.#formDefaults,
      models: SUPPORTED_MODELS,
      onBack: exit,
      onCast: (snap) => this.#castAction(spell, snap),
      onOverrideChanged: () => this.#spellsPanel.refreshOverrides(),
    });
    this.#enterDetail(detail, exit, { suspendKb: true });
  }

  #renderGenericSentinelDetail(sentinel: Sentinel): void {
    const exit = (): void => this.#exitDetail();
    this.contentEl.createEl("h2", { text: sentinel.name });
    this.contentEl.createEl("p", { text: `Type: ${sentinel.kind}` });
    const back = this.contentEl.createEl("button", { text: "← back" });
    back.onClickEvent(exit);
    this.#enterDetail({ destroy() {} }, exit, { suspendKb: false });
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
