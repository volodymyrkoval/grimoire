import type { Spell } from "../../domain/spells/Spell";

export class SpellRow {
  readonly el: HTMLElement;

  constructor(container: HTMLElement, spell: Spell, selected: boolean, onClick: () => void) {
    this.el = container.createDiv({ cls: "spells-row" });
    if (selected) this.el.addClass("is-selected");
    this.el.createSpan({ text: spell.name });
    this.el.onClickEvent(onClick);
  }
}
