export class TabBar {
  readonly el: HTMLElement;

  constructor(
    container: HTMLElement,
    tabs: readonly string[],
    activeTab: string,
    disabled: boolean,
    onSwitch: (tab: string) => void
  ) {
    this.el = container.createDiv({ cls: "modal-tab-bar" });
    tabs.forEach((id) => {
      const tab = this.el.createDiv({ cls: "modal-tab" });
      if (id === activeTab) tab.addClass("is-active");
      if (disabled) tab.addClass("is-disabled");
      tab.setText(id.charAt(0).toUpperCase() + id.slice(1));
      tab.onClickEvent(() => {
        if (!disabled) onSwitch(id);
      });
    });
  }
}
