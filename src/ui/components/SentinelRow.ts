import type { Sentinel } from "../../domain/spells/Spell";

/**
 * Renders a single sentinel row (Forge, Refine) in the spells list.
 * Displays the sentinel name and selected state.
 */
export class SentinelRow {
  el!: HTMLElement;

  render(container: HTMLElement, sentinel: Sentinel, selected: boolean): void {
    this.el = container.createDiv({ cls: "sentinel-row" });
    if (selected) this.#markSelected();
    this.#appendName(sentinel.name);
  }

  #markSelected(): void {
    this.el.addClass("is-selected");
  }

  #appendName(name: string): void {
    this.el.createSpan({ cls: "sentinel-name", text: name });
  }
}
