import { App, Modal } from "obsidian";
import { KeyboardController } from "./KeyboardController";
import {Spell} from "../domain/spells/Spell";
import {spellPath} from "../domain/spells/SpellPath";

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

type Log = {
  name: string
}

const LOGS = [
  {
    name: 'log 1'
  }
]


const TAB_DATA: Record<Tab, readonly Spell[] | Log[]> = {
  spells: ALL_SPELLS,
  logs: LOGS,
};

const TABS: Tab[] = ["spells", "logs"];

export class CommandPopup extends Modal {
  private selectedIndex = 0;
  private activeTab: Tab = "spells";
  private phase: "search" | "detail" = "search";
  private filtered: Spell[] = [...ALL_SPELLS];
  #kb = new KeyboardController(this.scope);

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    this.render();

    this.#kb.bind([], "ArrowDown", () => {
      this.move(1);
      return true
    })

    this.#kb.bind([], "ArrowUp", () => {
      this.move(-1);
      return true;
    });

    this.#kb.bind([], "Enter", () => {
      this.confirm();
      return true;
    });

    this.#kb.bind([], "Tab", () => {
      if (this.phase === "detail") return false;
      const next = (TABS.indexOf(this.activeTab) + 1) % TABS.length;
      this.switchTab(TABS[next]);
      return true;
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  close() {
    if (this.phase === "detail") {
      this.renderSearch();
      return;
    }
    super.close();
  }

  private render() {
    this.contentEl.empty();
    this.renderTabBar();
    this.renderSearch();
  }

  private renderTabBar() {
    const bar = this.contentEl.createDiv({ cls: "modal-tab-bar" });

    TABS.forEach((id) => {
      const tab = bar.createDiv({ cls: "modal-tab" });
      if (id === this.activeTab) tab.addClass("is-active");
      if (this.phase === "detail") tab.addClass("is-disabled");
      tab.setText(id.charAt(0).toUpperCase() + id.slice(1));
      tab.onClickEvent(() => {
        if (this.phase === "detail") return;
        this.switchTab(id);
      });
    });
  }

  private renderSearch() {
    this.phase = "search";

    // Remove everything below the tab bar
    const bar = this.contentEl.querySelector(".modal-tab-bar");
    this.contentEl.empty();
    if (bar) this.contentEl.appendChild(bar);

    const input = this.contentEl.createEl("input", { type: "text" });
    input.placeholder = `Search ${this.activeTab}…`;
    input.focus();

    input.oninput = () => {
      const query = input.value.toLowerCase();
      this.filtered = TAB_DATA[this.activeTab].filter((s) =>
        s.name.toLowerCase().includes(query)
      );
      this.selectedIndex = 0;
      this.renderList();
    };

    this.contentEl.createDiv({ cls: "spell-list" });
    this.renderList();
  }

  private renderList() {
    const list = this.contentEl.querySelector<HTMLElement>(".spell-list");
    if (!list) return;
    list.empty();

    this.filtered.forEach((spell, i) => {
      const row = list.createDiv({ cls: "spell-row" });
      if (i === this.selectedIndex) row.addClass("is-selected");

      const header = row.createDiv({ cls: "spell-row-header" });
      header.createSpan({ text: spell.name });

      if (spell.expandable) {
        header.createSpan({ text: "▶", cls: "spell-expand-icon" });

        const body = row.createDiv({ cls: "spell-row-body" });
        body.createEl("p", { text: spell.description });
        body.createEl("p", { text: `Damage: ${spell.damage}` });

        header.onClickEvent(() => {
          const expanded = row.hasClass("is-expanded");
          row.toggleClass("is-expanded", !expanded);
          header.querySelector<HTMLElement>(".spell-expand-icon")!.textContent =
            expanded ? "▶" : "▼";
        });
      } else {
        header.onClickEvent(() => this.renderDetail(spell));
      }
    });
  }

  private move(delta: number) {
    if (this.phase !== "search" || this.filtered.length === 0) return;

    const list = this.contentEl.querySelector(".spell-list");
    list?.children[this.selectedIndex]?.removeClass("is-selected");

    this.selectedIndex =
      (this.selectedIndex + delta + this.filtered.length) %
      this.filtered.length;

    const next = list?.children[this.selectedIndex] as HTMLElement | undefined;
    next?.addClass("is-selected");
    next?.scrollIntoView({ block: "nearest" });
  }

  private renderDetail(spell: Spell) {
    this.phase = "detail";

    const bar = this.contentEl.querySelector(".modal-tab-bar");
    this.contentEl.empty();
    if (bar) this.contentEl.appendChild(bar);

    this.contentEl.createEl("h2", { text: spell.name });
    this.contentEl.createEl("p", { text: spell.description });
    this.contentEl.createEl("p", { text: `Damage: ${spell.damage}` });

    const back = this.contentEl.createEl("button", { text: "← Back" });
    back.onClickEvent(() => this.renderSearch());
  }

  private confirm() {
    if (this.phase !== "search") return;
    const spell = this.filtered[this.selectedIndex];
    if (!spell) return;

    if (spell.expandable) {
      const list = this.contentEl.querySelector(".spell-list");
      const row = list?.children[this.selectedIndex] as HTMLElement | undefined;
      if (!row) return;
      const expanded = row.hasClass("is-expanded");
      row.toggleClass("is-expanded", !expanded);
      const icon = row.querySelector<HTMLElement>(".spell-expand-icon");
      if (icon) icon.textContent = expanded ? "▶" : "▼";
    } else {
      this.renderDetail(spell);
    }
  }

  private switchTab(tab: Tab) {
    this.activeTab = tab;
    this.phase = "search";
    this.selectedIndex = 0;
    this.filtered = [...TAB_DATA[tab]];
    this.render();
  }
}
