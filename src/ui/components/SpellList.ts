import type { Spell } from "../../domain/spells/Spell";
import { SpellRow } from "./SpellRow";

export class SpellList {
  readonly el: HTMLElement;
  private rows: SpellRow[] = [];

  constructor(container: HTMLElement, private readonly onSelect: (spell: Spell) => void) {
    this.el = container.createDiv({ cls: "spells-list" });
  }

  render(spells: Spell[], selectedIndex: number): void {
    this.el.empty();
    this.rows = spells.map(
      (spell, i) => new SpellRow(this.el, spell, i === selectedIndex, () => this.onSelect(spell))
    );
  }

  updateSelection(prev: number, next: number): void {
    this.rows[prev]?.el.removeClass("is-selected");
    this.rows[next]?.el.addClass("is-selected");
    this.rows[next]?.el.scrollIntoView({ block: "nearest" });
  }

  get length(): number {
    return this.rows.length;
  }
}
