/** Contract for a tab panel rendered inside `CommandPopup`: mount and optionally unmount. */
export interface TabPanel {
  readonly id: string;
  mount(container: HTMLElement): void;
  /** Optional teardown — called by CommandPopup.onClose to stop coordinators. */
  unmount?(): void;
}

/** Extension for panels that support keyboard navigation and text filtering. */
export interface NavigablePanel extends TabPanel {
  /** Returns the index the panel should focus after filtering. */
  filter(query: string): number;
  reset(): void;
  move(delta: number, current: number): number;
  updateSelection(prev: number, next: number): void;
  confirm(index: number): void;
  readonly length: number;
}

export function isNavigable(panel: TabPanel): panel is NavigablePanel {
  return 'filter' in panel;
}
