import type { Spell } from "../../domain/spells/Spell";
import type { TypedEmitter } from "../TypedEmitter";
import type { SpellEvents } from "../SpellEvents";
import { SpellRow } from "./SpellRow";

export class SpellList {
  readonly el: HTMLElement;
  private rows: SpellRow[] = [];

  constructor(container: HTMLElement, private readonly emitter: TypedEmitter<SpellEvents>) {
    this.el = container.createDiv({ cls: "spells-list" });
  }

  render(spells: Spell[], selectedIndex: number): void {
    this.el.empty();
    this.rows = spells.map((spell, i) => {
      const row = new SpellRow(this.el, spell, i === selectedIndex);
      row.el.onClickEvent(() => this.emitter.emit("detail", spell));
      return row;
    });
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
