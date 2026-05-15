export class TabBar {
  el!: HTMLElement;

  render(
    container: HTMLElement,
    tabs: readonly string[],
    activeTab: string,
    disabled: boolean,
    onSwitch: (tab: string) => void
  ): void {
    this.#createBar(container);
    this.#buildTabs(tabs, activeTab, disabled, onSwitch);
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
}
