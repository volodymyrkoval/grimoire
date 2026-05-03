import type { Sentinel } from "../../domain/spells/Spell";

export class SentinelRow {
  readonly el: HTMLElement;

  constructor(container: HTMLElement, sentinel: Sentinel, selected: boolean) {
    this.el = container.createDiv({ cls: "sentinel-row" });
    if (selected) this.el.addClass("is-selected");
    this.el.createSpan({ cls: "sentinel-name", text: sentinel.name });
  }
}
