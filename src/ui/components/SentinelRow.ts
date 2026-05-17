import type { Sentinel, SentinelKind } from "../../domain/spells/Spell";
import { appendRowHint } from "./rowHint";

const DESCRIPTIONS: Partial<Record<SentinelKind, string>> = {
  forge: 'Author a new spell from a description',
  refine: 'Rewrite the active note',
};

/**
 * Renders a single sentinel row (Forge, Refine) in the spells list.
 * Displays the sentinel name and selected state.
 */
export class SentinelRow {
  el!: HTMLElement;

  /** Renders the sentinel row into the container. Sets `this.el` as a side effect. */
  render(container: HTMLElement, sentinel: Sentinel, selected: boolean, showHint: boolean = false, onOptionsClick?: () => void): void {
    this.el = container.createDiv({ cls: "sentinel-row" });
    if (selected) this.#markSelected();
    this.#appendName(sentinel.name);
    const description = DESCRIPTIONS[sentinel.kind];
    if (description) this.#appendDescription(description);
    if (showHint) appendRowHint(this.el, onOptionsClick);
  }

  #markSelected(): void {
    this.el.addClass("is-selected");
  }

  #appendName(name: string): void {
    this.el.createSpan({ cls: "sentinel-name", text: name });
  }

  #appendDescription(text: string): void {
    this.el.createDiv({ cls: "sentinel-description", text });
  }
}
