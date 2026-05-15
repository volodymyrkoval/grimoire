import type { Spell } from "../../domain/spells/Spell";

export class SpellRow {
  el!: HTMLElement;

  render(container: HTMLElement, spell: Spell, selected: boolean, hasOverride: boolean = false): void {
    this.el = container.createDiv({ cls: "spells-row" });
    if (selected) this.#markSelected();
    this.#appendName(spell.name);
    if (hasOverride) this.#appendOverrideDot();
    this.#appendHint();
  }

  #markSelected(): void {
    this.el.addClass("is-selected");
  }

  #appendName(name: string): void {
    this.el.createSpan({ text: name });
  }

  #appendOverrideDot(): void {
    this.el.createSpan({ cls: "grimoire-override-dot" });
  }

  #appendHint(): void {
    this.el.createSpan({ cls: "spells-row-hint", text: "↵ cast · → options" });
  }
}
