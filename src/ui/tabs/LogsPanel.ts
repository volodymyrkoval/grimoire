import type { TabPanel } from "./TabPanel";
import { ALL_LOGS, type Log } from "../../domain/logs/Log";
import { LogList } from "../components/LogList";

export class LogsPanel implements TabPanel {
  readonly id = "logs";
  private filteredLogs: Log[] = [...ALL_LOGS];
  private logList: LogList | null = null;

  mount(container: HTMLElement): void {
    this.logList = new LogList(container);
    this.logList.render(this.filteredLogs, 0);
  }

  filter(query: string): void {
    this.filteredLogs = ALL_LOGS.filter((l) =>
      l.name.toLowerCase().includes(query)
    );
    this.logList?.render(this.filteredLogs, 0);
  }

  confirm(index: number): void {
    this.logList?.toggleExpand(index);
  }

  move(delta: number, current: number): number {
    if (this.length === 0) return current;
    return (current + delta + this.length) % this.length;
  }

  updateSelection(prev: number, next: number): void {
    this.logList?.updateSelection(prev, next);
  }

  get length(): number {
    return this.logList?.length ?? 0;
  }

  reset(): void {
    this.filteredLogs = [...ALL_LOGS];
  }
}
