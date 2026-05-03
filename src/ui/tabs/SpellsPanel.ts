import type { TabPanel } from "./TabPanel";
import type { Spell } from "../../domain/spells/Spell";
import { spellPath } from "../../domain/spells/SpellPath";
import { SpellList } from "../components/SpellList";

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

export class SpellsPanel implements TabPanel {
  readonly id = "spells";
  private filteredSpells: Spell[] = [...ALL_SPELLS];
  private spellList: SpellList | null = null;

  constructor(private readonly onDetail: (spell: Spell) => void) {}

  mount(container: HTMLElement): void {
    this.spellList = new SpellList(container, (spell) => this.onDetail(spell));
    this.spellList.render(this.filteredSpells, 0);
  }

  filter(query: string): void {
    this.filteredSpells = ALL_SPELLS.filter((s) =>
      s.name.toLowerCase().includes(query)
    );
    this.spellList?.render(this.filteredSpells, 0);
  }

  confirm(index: number): void {
    const spell = this.filteredSpells[index];
    if (spell) this.onDetail(spell);
  }

  move(delta: number, current: number): number {
    if (this.length === 0) return current;
    return (current + delta + this.length) % this.length;
  }

  updateSelection(prev: number, next: number): void {
    this.spellList?.updateSelection(prev, next);
  }

  get length(): number {
    return this.spellList?.length ?? 0;
  }

  reset(): void {
    this.filteredSpells = [...ALL_SPELLS];
  }
}
