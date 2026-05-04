import { App, Modal } from "obsidian";
import { KeyboardController } from "./KeyboardController";
import type { Spell, Sentinel } from "../domain/spells/Spell";
import { TabBar } from "./components/TabBar";
import { ForgeSentinelDetail } from "./components/ForgeSentinelDetail";
import type { TabPanel } from "./tabs/TabPanel";
import { SpellsPanel } from "./tabs/SpellsPanel";
import { LogsPanel } from "./tabs/LogsPanel";

export class CommandPopup extends Modal {
  private selectedIndex = 0;
  private phase: "search" | "detail" = "search";
  #searchQuery = "";
  private readonly panels: readonly TabPanel[];
  private activePanel: TabPanel;
  private tabBar: TabBar | null = null;
  #kb = new KeyboardController(this.scope);
  #activeForgeSentinelDetail: ForgeSentinelDetail | null = null;

  constructor(app: App) {
    super(app);
    const spellsPanel = new SpellsPanel();
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
      this.#activeForgeSentinelDetail?.destroy();
      this.#activeForgeSentinelDetail = null;
      this.#kb.resume();
      this.renderSearch();
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
    this.selectedIndex = 0;
    this.reattachTabBar();
    this.mountSearchInput();
  }

  private reattachTabBar(): void {
    const barEl = this.tabBar?.el;
    this.contentEl.empty();
    if (barEl) this.contentEl.appendChild(barEl);
  }

  private mountSearchInput(): void {
    const input = this.contentEl.createEl("input", { type: "text" });
    input.placeholder = `Search ${this.activePanel.id}…`;
    input.value = this.#searchQuery;
    input.focus();
    this.activePanel.mount(this.contentEl);
    if (this.#searchQuery) {
      this.selectedIndex = this.activePanel.filter(this.#searchQuery);
    }
    input.oninput = () => {
      this.#searchQuery = input.value.toLowerCase();
      this.selectedIndex = this.activePanel.filter(this.#searchQuery);
    };
  }

  private renderDetail(spell: Spell): void {
    this.phase = "detail";
    this.#kb.suspend();
    this.reattachTabBar();
    this.contentEl.createEl("h2", { text: spell.name });
    const back = this.contentEl.createEl("button", { text: "← Back" });
    back.onClickEvent(() => { this.#kb.resume(); this.renderSearch(); });
  }

  private renderSentinelDetail(sentinel: Sentinel): void {
    this.phase = "detail";
    this.reattachTabBar();

    if (sentinel.kind === "forge") {
      this.#kb.suspend();
      const exitForgeDetail = (): void => {
        this.#activeForgeSentinelDetail?.destroy();
        this.#activeForgeSentinelDetail = null;
        this.#kb.resume();
        this.renderSearch();
      };
      this.#activeForgeSentinelDetail = new ForgeSentinelDetail(this.contentEl, this.scope, {
        onBack: exitForgeDetail,
        onSubmit: exitForgeDetail,
      });
    } else {
      // Generic sentinel detail for other kinds
      this.contentEl.createEl("h2", { text: sentinel.name });
      this.contentEl.createEl("p", { text: `Type: ${sentinel.kind}` });
      const back = this.contentEl.createEl("button", { text: "← Back" });
      back.onClickEvent(() => this.renderSearch());
    }
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
    panel.reset();
    this.render();
  }
}
