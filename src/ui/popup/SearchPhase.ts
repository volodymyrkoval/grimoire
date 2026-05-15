import type { PopupPhase, PopupPhaseContext } from './PopupPhase';
import { isNavigable } from '../tabs/TabPanel';

/**
 * Search phase: default mode where arrow keys navigate list, Enter confirms selection,
 * Tab switches panels, and arrow-right opens options (spell details).
 */
export class SearchPhase implements PopupPhase {
  readonly kind = 'search' as const;
  readonly #ctx: PopupPhaseContext;

  constructor(ctx: PopupPhaseContext) {
    this.#ctx = ctx;
  }

  handleArrow(delta: -1 | 1): boolean {
    const activePanel = this.#ctx.activePanel();
    if (!isNavigable(activePanel) || activePanel.length === 0) return false;
    const prev = this.#ctx.selectedIndex();
    const next = activePanel.move(delta, prev);
    activePanel.updateSelection(prev, next);
    this.#ctx.setSelectedIndex(next);
    return true;
  }

  handleEnter(): boolean {
    const activePanel = this.#ctx.activePanel();
    if (!isNavigable(activePanel)) return false;
    activePanel.confirm(this.#ctx.selectedIndex());
    return true;
  }

  handleTab(): boolean {
    const panels = this.#ctx.panels();
    const activePanel = this.#ctx.activePanel();
    const currentIndex = panels.indexOf(activePanel);
    const nextIndex = (currentIndex + 1) % panels.length;
    const nextPanel = panels[nextIndex];
    activePanel.unmount?.();
    this.#ctx.setActivePanel(nextPanel);
    if (nextPanel && isNavigable(nextPanel)) {
      nextPanel.reset();
    }
    if (isNavigable(nextPanel)) {
      this.#ctx.setSelectedIndex(0);
    }
    this.#ctx.renderSearch();
    return true;
  }

  handleArrowRight(): boolean {
    const activePanel = this.#ctx.activePanel();
    const spellsPanel = this.#ctx.spellsPanel();
    if (activePanel !== spellsPanel) return false;
    if (spellsPanel.length === 0) return false;
    const selectedIndex = this.#ctx.selectedIndex();
    if (selectedIndex < 0 || selectedIndex >= spellsPanel.length) return false;
    spellsPanel.openOptions(selectedIndex);
    return true;
  }

  interceptClose(): boolean {
    return false;
  }
}
