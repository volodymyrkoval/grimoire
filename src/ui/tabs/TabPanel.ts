export interface TabPanel {
  readonly id: string;
  mount(container: HTMLElement): void;
  filter(query: string): void;
  confirm(index: number): void;
  move(delta: number, current: number): number;
  updateSelection(prev: number, next: number): void;
  readonly length: number;
  reset(): void;
}
