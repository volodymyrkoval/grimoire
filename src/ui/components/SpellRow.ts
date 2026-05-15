import type { Spell } from "../../domain/spells/Spell";
import { appendRowHint } from "./rowHint";

/**
 * Renders a single spell row in the spells list.
 * Displays spell name, override indicator (dot), and keyboard hint text.
 */
export class SpellRow {
  el!: HTMLElement;

  /** Renders the spell row into the container. Sets `this.el` as a side effect. */
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
    appendRowHint(this.el);
  }
}
