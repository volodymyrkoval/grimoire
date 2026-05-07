import { App } from "obsidian";
import type { TabPanel } from "./TabPanel";
import { type Spell, type Sentinel, isSentinel } from "../../domain/spells/Spell";
import type { SpellPath } from "../../domain/spells/SpellPath";
import { fuzzyFilter } from "../../domain/spells/fuzzyFilter";
import { getSpells } from "../../domain/spells/spellScanner";
import { SpellList } from "../components/SpellList";
import { TypedEmitter } from "../TypedEmitter";
import type { SpellEvents } from "../SpellEvents";

const SENTINELS: readonly Sentinel[] = [
  { kind: "forge", name: "Forge" },
  { kind: "refine", name: "Refine" },
];

export class SpellsPanel implements TabPanel {
  readonly id = "spells";
  readonly events = new TypedEmitter<SpellEvents>();
  private readonly allSpells: readonly Spell[];
  private filteredSpells: Spell[];
  private spellList: SpellList | null = null;
  #hasOverride: (path: SpellPath) => boolean = () => false;
  #lastSelectedIndex: number = 0;

  constructor(app: App, tag: string) {
    this.allSpells = getSpells(app, tag);
    this.filteredSpells = [...this.allSpells];
  }

  mount(container: HTMLElement, hasOverride?: (path: SpellPath) => boolean): void {
    if (hasOverride) {
      this.#hasOverride = hasOverride;
    }
    this.spellList = new SpellList(container, this.events, [...SENTINELS]);
    this.#lastSelectedIndex = 0;
    this.spellList.render(this.filteredSpells, this.#lastSelectedIndex, this.#hasOverride);
  }

  filter(query: string): number {
    const results = fuzzyFilter(this.allSpells, SENTINELS, query);
    this.filteredSpells = results.filter((item): item is Spell => !isSentinel(item));
    const initialIndex = this.sentinelFocusIndex(query);
    this.#lastSelectedIndex = initialIndex;
    this.spellList?.render(this.filteredSpells, this.#lastSelectedIndex, this.#hasOverride);
    return initialIndex;
  }

  confirm(index: number): void {
    if (index < this.filteredSpells.length) {
      const spell = this.filteredSpells[index];
      if (spell) this.events.emit("cast", spell);
    } else {
      const sentinel = SENTINELS[index - this.filteredSpells.length];
      if (sentinel) this.events.emit("sentinel", sentinel);
    }
  }

  openOptions(index: number): void {
    if (index < 0 || index >= this.filteredSpells.length) return;
    const spell = this.filteredSpells[index];
    this.events.emit("open-options", spell);
  }

  move(delta: number, current: number): number {
    if (this.length === 0) return current;
    return (current + delta + this.length) % this.length;
  }

  updateSelection(prev: number, next: number): void {
    this.#lastSelectedIndex = next;
    this.spellList?.updateSelection(prev, next);
  }

  get length(): number {
    return this.spellList?.length ?? 0;
  }

  reset(): void {
    this.filteredSpells = [...this.allSpells];
  }

  setHasOverride(predicate: (path: SpellPath) => boolean): void {
    this.#hasOverride = predicate;
  }

  refreshOverrides(): void {
    this.spellList?.render(this.filteredSpells, this.#lastSelectedIndex, this.#hasOverride);
  }

  private sentinelFocusIndex(query: string): number {
    if (!query || this.filteredSpells.length > 0) return 0;
    const idx = SENTINELS.findIndex((s) =>
      s.name.toLowerCase().includes(query)
    );
    return idx >= 0 ? this.filteredSpells.length + idx : 0;
  }
}
