import type { TabPanel, NavigablePanel } from '../tabs/TabPanel';

export interface PopupPhaseContext {
  activePanel(): TabPanel;
  selectedIndex(): number;
  setSelectedIndex(i: number): void;
  setActivePanel(panel: TabPanel): void;
  spellsPanel(): NavigablePanel & { openOptions(index: number): void };
  panels(): readonly TabPanel[];
  kb(): { suspend(): void; resume(): void };
  contentEl(): HTMLElement;
  exitDetail(): void;
  renderSearch(): void;
}

export interface PopupPhase {
  readonly kind: 'search' | 'detail';
  handleArrow(delta: -1 | 1): boolean;
  handleEnter(): boolean;
  handleTab(): boolean;
  handleArrowRight(): boolean;
  interceptClose(): boolean;
}
