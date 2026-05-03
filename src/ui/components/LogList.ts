import type { Log } from "../../domain/logs/Log";
import { LogRow } from "./LogRow";

export class LogList {
  readonly el: HTMLElement;
  private rows: LogRow[] = [];

  constructor(container: HTMLElement) {
    this.el = container.createDiv({ cls: "spells-list" });
  }

  render(logs: Log[], selectedIndex: number): void {
    this.el.empty();
    this.rows = logs.map((log, i) => new LogRow(this.el, log, i === selectedIndex));
  }

  updateSelection(prev: number, next: number): void {
    this.rows[prev]?.el.removeClass("is-selected");
    this.rows[next]?.el.addClass("is-selected");
    this.rows[next]?.el.scrollIntoView({ block: "nearest" });
  }

  toggleExpand(index: number): void {
    this.rows[index]?.toggle();
  }

  get length(): number {
    return this.rows.length;
  }
}
