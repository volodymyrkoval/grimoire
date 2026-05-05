import type { TabPanel } from "./TabPanel";
import { type Spell, type Sentinel, isSentinel } from "../../domain/spells/Spell";
import { spellPath } from "../../domain/spells/SpellPath";
import { fuzzyFilter } from "../../domain/spells/fuzzyFilter";
import { SpellList } from "../components/SpellList";
import { TypedEmitter } from "../TypedEmitter";
import type { SpellEvents } from "../SpellEvents";

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

const SENTINELS: readonly Sentinel[] = [
  { kind: "forge", name: "Forge" },
  { kind: "refine", name: "Refine" },
];

export class SpellsPanel implements TabPanel {
  readonly id = "spells";
  readonly events = new TypedEmitter<SpellEvents>();
  private filteredSpells: Spell[] = [...ALL_SPELLS];
  private spellList: SpellList | null = null;

  mount(container: HTMLElement): void {
    this.spellList = new SpellList(container, this.events, [...SENTINELS]);
    this.spellList.render(this.filteredSpells, 0);
  }

  filter(query: string): number {
    const results = fuzzyFilter(ALL_SPELLS, SENTINELS, query);
    this.filteredSpells = results.filter((item): item is Spell => !isSentinel(item));
    const initialIndex = this.sentinelFocusIndex(query);
    this.spellList?.render(this.filteredSpells, initialIndex);
    return initialIndex;
  }

  confirm(index: number): void {
    if (index < this.filteredSpells.length) {
      const spell = this.filteredSpells[index];
      if (spell) this.events.emit("detail", spell);
    } else {
      const sentinel = SENTINELS[index - this.filteredSpells.length];
      if (sentinel) this.events.emit("sentinel", sentinel);
    }
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

  private sentinelFocusIndex(query: string): number {
    if (!query || this.filteredSpells.length > 0) return 0;
    const idx = SENTINELS.findIndex((s) =>
      s.name.toLowerCase().includes(query)
    );
    return idx >= 0 ? this.filteredSpells.length + idx : 0;
  }
}
