/** Contract for a tab panel rendered inside `CommandPopup`: mount, filter, navigate, and confirm entries. */
export interface TabPanel {
  readonly id: string;
  mount(container: HTMLElement): void;
  filter(query: string): number;
  confirm(index: number): void;
  move(delta: number, current: number): number;
  updateSelection(prev: number, next: number): void;
  readonly length: number;
  reset(): void;
}
