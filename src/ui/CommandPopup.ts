import { App, Modal } from "obsidian";
import { KeyboardController } from "./KeyboardController";
import type { Spell, Sentinel } from "../domain/spells/Spell";
import { TabBar } from "./components/TabBar";
import { SearchInput } from "./components/SearchInput";
import { ForgeSentinelDetail } from "./components/ForgeSentinelDetail";
import type { TabPanel } from "./tabs/TabPanel";
import { SpellsPanel } from "./tabs/SpellsPanel";
import { CastLogPanel } from "./tabs/CastLogPanel";
import type { CastLogPanelDeps } from "./tabs/CastLogPanel";
import type { ForgeFormSnapshot } from "../forge/ForgeFormSnapshot";
import { SUPPORTED_MODELS } from "../domain/settings/Settings";
import type { FormDefaults } from "../domain/settings/FormDefaults";
import { SpellOverrideStore } from "../domain/settings/SpellOverrideStore";
import { OptionsSessionMap } from "./options/OptionsSessionMap";
import type { OptionsFormSnapshot } from "./options/OptionsFormState";
import { SpellOptionsDetail } from "./components/SpellOptionsDetail";

export type ImprintAction = (snapshot: ForgeFormSnapshot) => void;
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

export class CommandPopup extends Modal {
  #selectedIndex = 0;
  // eslint-disable-next-line no-restricted-syntax -- accessed via bracket notation in tests
  private phase: "search" | "detail" = "search";
  #searchQuery = "";
  // eslint-disable-next-line no-restricted-syntax -- accessed via bracket notation in tests
  private readonly panels: readonly TabPanel[];
  #activePanel: TabPanel;
  #tabBar: TabBar | null = null;
  #kb = new KeyboardController(this.scope);
  #onDetailBack: (() => void) | null = null;
  #activeDetail: { destroy(): void } | null = null;
  readonly #imprintAction: ImprintAction;
  readonly #castAction: CastAction;
  readonly #formDefaults: FormDefaults;
  readonly #overrides: SpellOverrideStore;
  readonly #sessionMap: OptionsSessionMap;

  constructor(params: CommandPopupParams) {
    super(params.app);
    this.#imprintAction = params.imprintAction;
    this.#castAction = params.castAction;
    this.#formDefaults = params.defaults;
    this.#overrides = params.overrides;
    this.#sessionMap = params.sessionMap;
    const castLogPanel = new CastLogPanel({
      ...params.castLogPanelDeps,
      openLink: (path) => {
        void this.app.workspace.openLinkText(path, '', false);
        this.close();
      },
    });
    this.panels = [this.#createSpellsPanel(params.spellTag), castLogPanel];
    this.#activePanel = this.panels[0];
  }

  onOpen(): void {
    this.#selectedIndex = 0;
    this.#searchQuery = "";
    this.#activePanel = this.panels[0];
    this.phase = "search";
    this.#render();
    this.#bindKeys();
  }

  #bindKeys(): void {
    this.#kb.bind([], "ArrowDown", () => { this.#move(1); return true; });
    this.#kb.bind([], "ArrowUp", () => { this.#move(-1); return true; });
    this.#kb.bind([], "Enter", () => { this.#confirm(); return true; });
    this.#kb.bind([], "Tab", () => {
      if (this.phase === "detail") return false;
      const next = (this.panels.indexOf(this.#activePanel) + 1) % this.panels.length;
      this.#switchTab(this.panels[next]);
      return true;
    });
    this.#kb.bind([], "ArrowRight", () => {
      if (this.phase !== "search") return false;
      if (this.#activePanel !== this.panels[0]) return false;
      (this.panels[0] as SpellsPanel).openOptions(this.#selectedIndex);
      return true;
    });
  }

  // Obsidian's scope system and subcomponents can call close() directly,
  // bypassing keyboard handlers — intercept here to enforce phase navigation.
  override close(): void {
    if (this.phase === "detail") {
      const back = this.#onDetailBack;
      this.#onDetailBack = null;
      back?.();
      return;
    }
    super.close();
  }

  onClose(): void {
    this.panels.forEach((p) => p.unmount?.());
    this.contentEl.empty();
  }

  #render(): void {
    this.contentEl.empty();
    this.#tabBar = this.#createTabBar();
    this.#renderSearch();
  }

  #createTabBar(): TabBar {
    return new TabBar(
      this.contentEl,
      this.panels.map((p) => p.id),
      this.#activePanel.id,
      this.phase === "detail",
      (id) => {
        const panel = this.panels.find((p) => p.id === id);
        if (panel) this.#switchTab(panel);
      }
    );
  }

  #createSpellsPanel(spellTag: string): SpellsPanel {
    const panel = new SpellsPanel(this.app, spellTag);
    panel.setHasOverride((path) => this.#overrides.has(path));
    panel.events.on("cast", (spell) => {
      const snapshot: OptionsFormSnapshot = {
        model: this.#formDefaults.defaultModel,
        effort: this.#formDefaults.defaultEffort,
        contextNotePaths: [],
        followUp: '',
        executeOnNote: spell.executeOnNote,
      };
      this.#castAction(spell, snapshot);
    });
    panel.events.on("sentinel", (sentinel) => this.#renderSentinelDetail(sentinel));
    panel.events.on("open-options", (spell) => this.#renderOptionsPanel(spell));
    return panel;
  }

  #renderSearch(): void {
    this.phase = "search";
    this.#reattachTabBar();
    this.#mountSearchInput();
  }

  #reattachTabBar(): void {
    const barEl = this.#tabBar?.el;
    this.contentEl.empty();
    if (barEl) this.contentEl.appendChild(barEl);
  }

  #mountSearchInput(): void {
    new SearchInput(this.contentEl, this.#activePanel, this.#searchQuery, this.#selectedIndex, (query, idx) => {
      this.#searchQuery = query;
      this.#selectedIndex = idx;
    });
  }

  #exitDetail(): void {
    this.#onDetailBack = null;
    this.#activeDetail?.destroy();
    this.#activeDetail = null;
    this.#kb.resume();
    this.#renderSearch();
  }

  #renderSentinelDetail(sentinel: Sentinel): void {
    this.phase = "detail";
    this.#reattachTabBar();

    if (sentinel.kind === "forge") {
      this.#renderForgeSentinelDetail();
    } else {
      this.#renderGenericSentinelDetail(sentinel);
    }
  }

  #renderForgeSentinelDetail(): void {
    this.#kb.suspend();
    const exit = () => this.#exitDetail();
    this.#activeDetail = new ForgeSentinelDetail({
      contentEl: this.contentEl,
      scope: this.scope,
      callbacks: {
        onBack: exit,
        onSubmit: (snapshot) => {
          this.#imprintAction(snapshot);
          exit();
        },
      },
      defaults: this.#formDefaults,
    });
    this.#onDetailBack = exit;
  }

  #renderOptionsPanel(spell: Spell): void {
    this.phase = "detail";
    this.#reattachTabBar();
    this.#kb.suspend();
    const exit = () => this.#exitDetail();
    this.#activeDetail = new SpellOptionsDetail({
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
      onOverrideChanged: () => (this.panels[0] as SpellsPanel).refreshOverrides(),
    });
    this.#onDetailBack = exit;
  }

  #renderGenericSentinelDetail(sentinel: Sentinel): void {
    const exit = (): void => {
      this.#onDetailBack = null;
      this.#renderSearch();
    };
    this.#onDetailBack = exit;
    this.contentEl.createEl("h2", { text: sentinel.name });
    this.contentEl.createEl("p", { text: `Type: ${sentinel.kind}` });
    const back = this.contentEl.createEl("button", { text: "← back" });
    back.onClickEvent(exit);
  }

  #move(delta: number): void {
    if (this.phase !== "search" || this.#activePanel.length === 0) return;

    const prev = this.#selectedIndex;
    this.#selectedIndex = this.#activePanel.move(delta, this.#selectedIndex);
    this.#activePanel.updateSelection(prev, this.#selectedIndex);
  }

  #confirm(): void {
    if (this.phase !== "search") return;
    this.#activePanel.confirm(this.#selectedIndex);
  }

  #switchTab(panel: TabPanel): void {
    // Tear down the outgoing panel before swapping — otherwise re-entering it
    // (Spells → Logs → Spells) re-runs mount() on a panel that's still
    // holding live coordinators (e.g. CastLogPanel re-starting an already-
    // started VaultRefreshCoordinator).
    this.#activePanel.unmount?.();
    this.#activePanel = panel;
    this.phase = "search";
    this.#searchQuery = "";
    this.#selectedIndex = 0;
    panel.reset();
    this.#render();
  }
}
