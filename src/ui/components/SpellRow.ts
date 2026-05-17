import type { Spell } from "../../domain/spells/Spell";
import { appendRowHint } from "./rowHint";

/**
 * Renders a single spell row in the spells list.
 * Displays spell name, override indicator (dot), and keyboard hint text.
 */
export class SpellRow {
  el!: HTMLElement;

  /** Renders the spell row into the container. Sets `this.el` as a side effect. */
  render(container: HTMLElement, spell: Spell, selected: boolean, hasOverride: boolean = false, onOptionsClick?: () => void): void {
    this.el = container.createDiv({ cls: "spells-row" });
    if (selected) this.#markSelected();
    const nameBlock = this.el.createDiv({ cls: "spells-row-name" });
    this.#appendName(nameBlock, spell.name);
    if (hasOverride) this.#appendOverrideDot(nameBlock);
    this.#appendHint(onOptionsClick);
  }

  #markSelected(): void {
    this.el.addClass("is-selected");
  }

  #appendName(parent: HTMLElement, name: string): void {
    parent.createSpan({ text: name });
  }

  #appendOverrideDot(parent: HTMLElement): void {
    parent.createSpan({ cls: "grimoire-override-dot" });
  }

  #appendHint(onOptionsClick?: () => void): void {
    appendRowHint(this.el, onOptionsClick);
  }
}
