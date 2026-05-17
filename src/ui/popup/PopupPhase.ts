import type { TabPanel, NavigablePanel } from '../tabs/TabPanel';

/**
 * Context object passed to popup phases, exposing state getters/setters and callbacks.
 * Used by SearchPhase and DetailPhase to query state and trigger popup state transitions.
 */
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

/**
 * A mode handler for the popup: defines how keyboard events and close gestures are handled.
 * Implemented by SearchPhase and DetailPhase to enforce phase-specific navigation rules.
 */
export interface PopupPhase {
  readonly kind: 'search' | 'detail';
  handleArrow(delta: -1 | 1): boolean;
  handleEnter(): boolean;
  handleTab(): boolean;
  handleArrowRight(): boolean;
  interceptClose(): boolean;
  disablesTabBar(): boolean;
}
