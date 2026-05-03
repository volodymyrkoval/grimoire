import { App, Modal } from "obsidian";
import { KeyboardController } from "./KeyboardController";
import type { Spell } from "../domain/spells/Spell";
import { TabBar } from "./components/TabBar";
import type { TabPanel } from "./tabs/TabPanel";
import { SpellsPanel } from "./tabs/SpellsPanel";
import { LogsPanel } from "./tabs/LogsPanel";

export class CommandPopup extends Modal {
  private selectedIndex = 0;
  private phase: "search" | "detail" = "search";
  private readonly panels: readonly TabPanel[];
  private activePanel: TabPanel;
  private tabBar: TabBar | null = null;
  #kb = new KeyboardController(this.scope);

  constructor(app: App) {
    super(app);
    this.panels = [
      new SpellsPanel((spell) => this.renderDetail(spell)),
      new LogsPanel(),
    ];
    this.activePanel = this.panels[0];
  }

  onOpen(): void {
    this.selectedIndex = 0;
    this.activePanel = this.panels[0];
    this.phase = "search";
    this.render();
    this.bindKeys();
  }

  private bindKeys(): void {
    this.#kb.bind([], "ArrowDown", () => { this.move(1); return true; });
    this.#kb.bind([], "ArrowUp", () => { this.move(-1); return true; });
    this.#kb.bind([], "Enter", () => { this.confirm(); return true; });
    this.#kb.bind([], "Escape", () => {
      if (this.phase === "detail") {
        this.renderSearch();
        return true;
      }
      return false;
    });
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
    input.focus();
    this.activePanel.mount(this.contentEl);
    input.oninput = () => {
      this.selectedIndex = 0;
      this.activePanel.filter(input.value.toLowerCase());
    };
  }

  private renderDetail(spell: Spell): void {
    this.phase = "detail";
    this.reattachTabBar();
    this.contentEl.createEl("h2", { text: spell.name });
    const back = this.contentEl.createEl("button", { text: "← Back" });
    back.onClickEvent(() => this.renderSearch());
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
    panel.reset();
    this.render();
  }
}
