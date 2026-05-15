import type { Sentinel } from "../../domain/spells/Spell";
import { appendRowHint } from "./rowHint";

/**
 * Renders a single sentinel row (Forge, Refine) in the spells list.
 * Displays the sentinel name and selected state.
 */
export class SentinelRow {
  el!: HTMLElement;

  /** Renders the sentinel row into the container. Sets `this.el` as a side effect. */
  render(container: HTMLElement, sentinel: Sentinel, selected: boolean, showHint: boolean = false): void {
    this.el = container.createDiv({ cls: "sentinel-row" });
    if (selected) this.#markSelected();
    this.#appendName(sentinel.name);
    if (showHint) appendRowHint(this.el);
  }

  #markSelected(): void {
    this.el.addClass("is-selected");
  }

  #appendName(name: string): void {
    this.el.createSpan({ cls: "sentinel-name", text: name });
  }
}
