import { App, Modal } from "obsidian";
import { KeyboardController } from "./KeyboardController";
import type { Spell } from "../domain/spells/Spell";
import { spellPath } from "../domain/spells/SpellPath";
import { ALL_LOGS, type Log } from "../domain/logs/Log";
import { TabBar } from "./components/TabBar";
import { SpellList } from "./components/SpellList";
import { LogList } from "./components/LogList";

type Tab = "spells" | "logs";

const ALL_SPELLS: readonly Spell[] = [
  { name: "Summoning Circle", path: spellPath("/spells/summoning") },
  { name: "Protection Rune", path: spellPath("/spells/protection") },
  { name: "Transmutation", path: spellPath("/spells/transmutation") },
  { name: "Scrying Mirror", path: spellPath("/spells/scrying") },
  { name: "Healing Incantation", path: spellPath("/spells/healing") },
  { name: "Banishment Hex", path: spellPath("/spells/banishment") },
  { name: "Divination Ritual", path: spellPath("/spells/divination") },
  { name: "Enchantment Charm", path: spellPath("/spells/enchantment") },
  { name: "Restoration Spell", path: spellPath("/spells/restoration") },
  { name: "Warding Barrier", path: spellPath("/spells/warding") },
];


const TABS: readonly Tab[] = ["spells", "logs"];

export class CommandPopup extends Modal {
  private selectedIndex = 0;
  private activeTab: Tab = "spells";
  private phase: "search" | "detail" = "search";
  private filteredSpells: Spell[] = [...ALL_SPELLS];
  private filteredLogs: Log[] = [...ALL_LOGS];
  private tabBar: TabBar | null = null;
  private spellList: SpellList | null = null;
  private logList: LogList | null = null;
  #kb = new KeyboardController(this.scope);

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    this.selectedIndex = 0;
    this.activeTab = "spells";
    this.phase = "search";
    this.filteredSpells = [...ALL_SPELLS];
    this.filteredLogs = [...ALL_LOGS];
    this.render();

    this.#kb.bind([], "ArrowDown", () => { this.move(1); return true; });
    this.#kb.bind([], "ArrowUp", () => { this.move(-1); return true; });
    this.#kb.bind([], "Enter", () => { this.confirm(); return true; });
    this.#kb.bind([], "Tab", () => {
      if (this.phase === "detail") return false;
      const next = (TABS.indexOf(this.activeTab) + 1) % TABS.length;
      this.switchTab(TABS[next]);
      return true;
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  close(): void {
    if (this.phase === "detail") {
      this.renderSearch();
      return;
    }
    super.close();
  }

  private render(): void {
    this.contentEl.empty();
    this.tabBar = new TabBar(
      this.contentEl,
      TABS,
      this.activeTab,
      this.phase === "detail",
      (tab) => this.switchTab(tab as Tab)
    );
    this.renderSearch();
  }

  private renderSearch(): void {
    this.phase = "search";

    const barEl = this.tabBar?.el;
    this.contentEl.empty();
    if (barEl) this.contentEl.appendChild(barEl);

    const input = this.contentEl.createEl("input", { type: "text" });
    input.placeholder = `Search ${this.activeTab}…`;
    input.focus();

    if (this.activeTab === "spells") {
      this.spellList = new SpellList(this.contentEl, (spell) => this.renderDetail(spell));
      this.spellList.render(this.filteredSpells, this.selectedIndex);
      this.logList = null;
    } else {
      this.logList = new LogList(this.contentEl);
      this.logList.render(this.filteredLogs, this.selectedIndex);
      this.spellList = null;
    }

    input.oninput = () => {
      const query = input.value.toLowerCase();
      this.selectedIndex = 0;
      if (this.activeTab === "spells") {
        this.filteredSpells = ALL_SPELLS.filter((s) => s.name.toLowerCase().includes(query));
        this.spellList?.render(this.filteredSpells, 0);
      } else {
        this.filteredLogs = ALL_LOGS.filter((l) => l.name.toLowerCase().includes(query));
        this.logList?.render(this.filteredLogs, 0);
      }
    };
  }

  private renderDetail(spell: Spell): void {
    this.phase = "detail";

    const barEl = this.tabBar?.el;
    this.contentEl.empty();
    if (barEl) this.contentEl.appendChild(barEl);

    this.contentEl.createEl("h2", { text: spell.name });
    const back = this.contentEl.createEl("button", { text: "← Back" });
    back.onClickEvent(() => this.renderSearch());
  }

  private move(delta: number): void {
    const list = this.activeTab === "spells" ? this.spellList : this.logList;
    if (this.phase !== "search" || !list || list.length === 0) return;

    const prev = this.selectedIndex;
    this.selectedIndex = (this.selectedIndex + delta + list.length) % list.length;
    list.updateSelection(prev, this.selectedIndex);
  }

  private confirm(): void {
    if (this.phase !== "search") return;

    if (this.activeTab === "spells") {
      const spell = this.filteredSpells[this.selectedIndex];
      if (spell) this.renderDetail(spell);
    } else {
      this.logList?.toggleExpand(this.selectedIndex);
    }
  }

  private switchTab(tab: Tab): void {
    this.activeTab = tab;
    this.phase = "search";
    this.selectedIndex = 0;
    this.filteredSpells = [...ALL_SPELLS];
    this.filteredLogs = [...ALL_LOGS];
    this.render();
  }
}
