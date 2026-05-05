import { App, Modal } from "obsidian";
import { KeyboardController } from "./KeyboardController";
import type { Spell, Sentinel } from "../domain/spells/Spell";
import { TabBar } from "./components/TabBar";
import { SearchInput } from "./components/SearchInput";
import { ForgeSentinelDetail } from "./components/ForgeSentinelDetail";
import type { TabPanel } from "./tabs/TabPanel";
import { SpellsPanel } from "./tabs/SpellsPanel";
import { LogsPanel } from "./tabs/LogsPanel";
import type { ForgeFormSnapshot } from "../forge/ForgeFormSnapshot";
import type { Effort } from "../domain/settings/Settings";

export type ImprintAction = (snapshot: ForgeFormSnapshot) => void;

export interface FormDefaults {
  defaultModel: string;
  defaultEffort: Effort | null;
}

export class CommandPopup extends Modal {
  private selectedIndex = 0;
  private phase: "search" | "detail" = "search";
  #searchQuery = "";
  private readonly panels: readonly TabPanel[];
  private activePanel: TabPanel;
  private tabBar: TabBar | null = null;
  #kb = new KeyboardController(this.scope);
  #onDetailBack: (() => void) | null = null;
  #activeDetail: { destroy(): void } | null = null;

  constructor(app: App, spellTag: string) {
    super(app);
    const spellsPanel = new SpellsPanel(this.app, spellTag);
    spellsPanel.events.on("detail", (spell) => this.renderDetail(spell));
    spellsPanel.events.on("sentinel", (sentinel) => this.renderSentinelDetail(sentinel));
    this.panels = [spellsPanel, new LogsPanel()];
    this.activePanel = this.panels[0];
  }

  onOpen(): void {
    this.selectedIndex = 0;
    this.#searchQuery = "";
    this.activePanel = this.panels[0];
    this.phase = "search";
    this.render();
    this.bindKeys();
  }

  private bindKeys(): void {
    this.#kb.bind([], "ArrowDown", () => { this.move(1); return true; });
    this.#kb.bind([], "ArrowUp", () => { this.move(-1); return true; });
    this.#kb.bind([], "Enter", () => { this.confirm(); return true; });
    this.#kb.bind([], "Tab", () => {
      if (this.phase === "detail") return false;
      const next = (this.panels.indexOf(this.activePanel) + 1) % this.panels.length;
      this.switchTab(this.panels[next]);
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
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();
    this.tabBar = this.createTabBar();
    this.renderSearch();
  }

  private createTabBar(): TabBar {
    return new TabBar(
      this.contentEl,
      this.panels.map((p) => p.id),
      this.activePanel.id,
      this.phase === "detail",
      (id) => {
        const panel = this.panels.find((p) => p.id === id);
        if (panel) this.switchTab(panel);
      }
    );
  }

  private renderSearch(): void {
    this.phase = "search";
    this.reattachTabBar();
    this.mountSearchInput();
  }

  private reattachTabBar(): void {
    const barEl = this.tabBar?.el;
    this.contentEl.empty();
    if (barEl) this.contentEl.appendChild(barEl);
  }

  private mountSearchInput(): void {
    new SearchInput(this.contentEl, this.activePanel, this.#searchQuery, this.selectedIndex, (query, idx) => {
      this.#searchQuery = query;
      this.selectedIndex = idx;
    });
  }

  private exitDetail(): void {
    this.#onDetailBack = null;
    this.#activeDetail?.destroy();
    this.#activeDetail = null;
    this.#kb.resume();
    this.renderSearch();
  }

  private renderDetail(spell: Spell): void {
    this.phase = "detail";
    this.#kb.suspend();
    const exit = () => this.exitDetail();
    this.#onDetailBack = exit;
    this.reattachTabBar();
    this.contentEl.createEl("h2", { text: spell.name });
    const back = this.contentEl.createEl("button", { text: "← Back" });
    back.onClickEvent(exit);
  }

  private renderSentinelDetail(sentinel: Sentinel): void {
    this.phase = "detail";
    this.reattachTabBar();

    if (sentinel.kind === "forge") {
      this.renderForgeSentinelDetail();
    } else {
      this.renderGenericSentinelDetail(sentinel);
    }
  }

  private renderForgeSentinelDetail(): void {
    this.#kb.suspend();
    const exit = () => this.exitDetail();
    const forgeSentinelDetail = new ForgeSentinelDetail(this.contentEl, this.scope, {
      onBack: exit,
      onSubmit: exit,
    });
    this.#activeDetail = forgeSentinelDetail;
    this.#onDetailBack = exit;
  }

  private renderGenericSentinelDetail(sentinel: Sentinel): void {
    const exit = (): void => {
      this.#onDetailBack = null;
      this.renderSearch();
    };
    this.#onDetailBack = exit;
    this.contentEl.createEl("h2", { text: sentinel.name });
    this.contentEl.createEl("p", { text: `Type: ${sentinel.kind}` });
    const back = this.contentEl.createEl("button", { text: "← Back" });
    back.onClickEvent(exit);
  }

  private move(delta: number): void {
    if (this.phase !== "search" || this.activePanel.length === 0) return;

    const prev = this.selectedIndex;
    this.selectedIndex = this.activePanel.move(delta, this.selectedIndex);
    this.activePanel.updateSelection(prev, this.selectedIndex);
  }

  private confirm(): void {
    if (this.phase !== "search") return;
    this.activePanel.confirm(this.selectedIndex);
  }

  private switchTab(panel: TabPanel): void {
    this.activePanel = panel;
    this.phase = "search";
    this.#searchQuery = "";
    this.selectedIndex = 0;
    panel.reset();
    this.render();
  }
}
