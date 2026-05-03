import type { Log } from "../../domain/logs/Log";

export class LogRow {
  readonly el: HTMLElement;
  private readonly icon: HTMLElement;

  constructor(container: HTMLElement, log: Log, selected: boolean) {
    this.el = container.createDiv({ cls: "spells-row" });
    if (selected) this.el.addClass("is-selected");

    const header = this.el.createDiv({ cls: "spells-row-header" });
    header.createSpan({ text: log.name });
    this.icon = header.createSpan({ text: "▶", cls: "spells-expand-icon" });
    this.el.createDiv({ cls: "spells-row-body" });

    header.onClickEvent(() => this.toggle());
  }

  toggle(): void {
    const expanded = this.el.hasClass("is-expanded");
    this.el.toggleClass("is-expanded", !expanded);
    this.icon.textContent = expanded ? "▶" : "▼";
  }
}
