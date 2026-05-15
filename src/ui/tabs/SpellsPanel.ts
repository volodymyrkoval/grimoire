import { App } from "obsidian";
import type { NavigablePanel } from "./TabPanel";
import { type Spell, type Sentinel, isSentinel } from "../../domain/spells/Spell";
import type { SpellPath } from "../../domain/spells/SpellPath";
import { fuzzyFilter } from "../../domain/spells/fuzzyFilter";
import { getSpells } from "../../domain/spells/spellScanner";
import { SpellList } from "../components/SpellList";
import { TypedEmitter } from "../../infra/TypedEmitter";
import type { SpellEvents } from "../../domain/spells/SpellEvents";

const SENTINELS: readonly Sentinel[] = [
  { kind: "forge", name: "Forge" },
  { kind: "refine", name: "Refine" },
];

/**
 * Spells panel: renders scanned spells + sentinels (Forge, Refine) with fuzzy filtering,
 * selection tracking, and override indicator display. Emits cast/sentinel/open-options events.
 *
 * Invariants:
 * - #allSpells is immutable (vault scan, set once in constructor).
 * - #filteredSpells is updated by filter() and reset by reset().
 * - #lastSelectedIndex tracks the cursor position for display and is restored across filters.
 * - #hasOverride is a predicate callback set by CommandPopup.setHasOverride() to show badges.
 * - Sentinels (Forge, Refine) are appended to the rendered list and access via index >= filteredSpells.length.
 */
export class SpellsPanel implements NavigablePanel {
  readonly id = "spells";
  readonly events = new TypedEmitter<SpellEvents>();
  readonly #allSpells: readonly Spell[];
  #filteredSpells: Spell[];
  #spellList: SpellList | null = null;
  #hasOverride: (path: SpellPath) => boolean = () => false;
  #lastSelectedIndex: number = 0;

  constructor(app: App, tag: string) {
    this.#allSpells = getSpells(app, tag);
    this.#filteredSpells = [...this.#allSpells];
  }

  /**
   * Mount the panel into a DOM container and optionally set the override predicate.
   * Called on each tab switch; initializes or reuses the internal SpellList component.
   */
  mount(container: HTMLElement, hasOverride?: (path: SpellPath) => boolean): void {
    if (hasOverride) {
      this.#hasOverride = hasOverride;
    }
    this.#initSpellList(container);
  }

  #initSpellList(container: HTMLElement): void {
    this.#spellList = new SpellList(container, this.events, [...SENTINELS]);
    this.#spellList.render(this.#filteredSpells, this.#lastSelectedIndex, this.#hasOverride);
  }

  /**
   * Filter spells by query and update the list.
   * Returns the initial selection index (auto-focus logic: top spell if any match,
   * or a sentinel if its name matches the query, otherwise 0).
   * Used by SearchInput to set the cursor position after each keystroke.
   */
  filter(query: string): number {
    const results = fuzzyFilter(this.#allSpells, SENTINELS, query);
    this.#filteredSpells = results.filter((item): item is Spell => !isSentinel(item));
    const initialIndex = this.#sentinelFocusIndex(query);
    this.#lastSelectedIndex = initialIndex;
    this.#spellList?.render(this.#filteredSpells, this.#lastSelectedIndex, this.#hasOverride);
    return initialIndex;
  }

  /**
   * Execute the action for a selected row (spell or sentinel).
   * - Spell at index < filteredSpells.length: emit cast event.
   * - Refine sentinel: emit dismiss-refine (closes modal, does not enter options).
   * - Forge or other sentinel: emit sentinel event (enters detail panel).
   * Index semantics: spells occupy [0, filteredSpells.length); sentinels occupy [filteredSpells.length, ...).
   */
  confirm(index: number): void {
    if (index < this.#filteredSpells.length) {
      const spell = this.#filteredSpells[index];
      if (spell) this.events.emit("cast", spell);
    } else {
      const sentinel = SENTINELS[index - this.#filteredSpells.length];
      if (sentinel) {
        if (sentinel.kind === "refine") {
          this.events.emit("dismiss-refine");
          return;
        }
        this.events.emit("sentinel", sentinel);
      }
    }
  }

  /**
   * Open the options/configuration panel for a spell or sentinel (Right arrow key).
   * - Spell: emit open-options with the spell.
   * - Refine sentinel: emit open-refine-options (configurable per-spell overrides).
   * - Forge or invalid index: no-op.
   */
  openOptions(index: number): void {
    if (index < 0) return;
    if (index < this.#filteredSpells.length) {
      this.events.emit("open-options", this.#filteredSpells[index]);
      return;
    }
    const sentinel = SENTINELS[index - this.#filteredSpells.length];
    if (sentinel?.kind === "refine") {
      this.events.emit("open-refine-options");
    }
  }

  /**
   * Navigate the cursor by delta (±1 for Up/Down arrow keys).
   * Wraps around using modular arithmetic (e.g., Down from bottom → top).
   * Returns the new index; if list is empty, returns current unchanged.
   */
  move(delta: number, current: number): number {
    if (this.length === 0) return current;
    return (current + delta + this.length) % this.length;
  }

  updateSelection(prev: number, next: number): void {
    this.#lastSelectedIndex = next;
    this.#spellList?.updateSelection(prev, next);
  }

  get length(): number {
    return this.#spellList?.length ?? 0;
  }

  reset(): void {
    this.#filteredSpells = [...this.#allSpells];
    this.#lastSelectedIndex = 0;
  }

  /**
   * Set the override-detection predicate (e.g., from SpellOverrideStore.has()).
   * Called by CommandPopup during construction; used by render() to show override badges.
   */
  setHasOverride(predicate: (path: SpellPath) => boolean): void {
    this.#hasOverride = predicate;
  }

  /**
   * Re-render the list to reflect updated override badges.
   * Called by CommandPopup when #overrides state changes in the options panel.
   */
  refreshOverrides(): void {
    this.#spellList?.render(this.#filteredSpells, this.#lastSelectedIndex, this.#hasOverride);
  }

  #sentinelFocusIndex(query: string): number {
    if (this.#shouldReturnToTop(query)) return 0;
    const idx = SENTINELS.findIndex((s) =>
      s.name.toLowerCase().includes(query)
    );
    return idx >= 0 ? this.#filteredSpells.length + idx : 0;
  }

  #shouldReturnToTop(query: string): boolean {
    return !query || this.#filteredSpells.length > 0;
  }
}
