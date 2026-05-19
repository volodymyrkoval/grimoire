/**
 * Renders a horizontal tab bar with disabled/active state management.
 * Tab labels are auto-capitalized from id (e.g., "spells" → "Spells").
 *
 * When `withRightSlot` is true, a `.modal-tab-bar-right` container is created
 * and exposed as `rightSlotEl`. Callers inject content into it after `render()`.
 */
export class TabBar {
  el!: HTMLElement;
  /** The right-aligned slot container; only set when `withRightSlot` was true. */
  rightSlotEl: HTMLElement | null = null;

  render(
    container: HTMLElement,
    tabs: readonly string[],
    activeTab: string,
    disabled: boolean,
    onSwitch: (tab: string) => void,
    withRightSlot?: boolean
  ): void {
    this.#createBar(container);
    this.#buildTabs(tabs, activeTab, disabled, onSwitch);
    if (withRightSlot) this.#createRightSlot();
  }

  #createBar(container: HTMLElement): void {
    this.el = container.createDiv({ cls: "modal-tab-bar" });
  }

  #buildTabs(tabs: readonly string[], activeTab: string, disabled: boolean, onSwitch: (tab: string) => void): void {
    tabs.forEach((id) => this.#buildTab(id, activeTab, disabled, onSwitch));
  }

  #buildTab(id: string, activeTab: string, disabled: boolean, onSwitch: (tab: string) => void): void {
    const tab = this.el.createDiv({ cls: "modal-tab" });
    if (id === activeTab) tab.addClass("is-active");
    if (disabled) tab.addClass("is-disabled");
    tab.setText(id.charAt(0).toUpperCase() + id.slice(1));
    tab.onClickEvent(() => { if (!disabled) onSwitch(id); });
  }

  #createRightSlot(): void {
    this.rightSlotEl = this.el.createDiv({ cls: "modal-tab-bar-right" });
  }
}
