import type { TabPanel } from "../tabs/TabPanel";

export class SearchInput {
  constructor(
    container: HTMLElement,
    panel: TabPanel,
    initialQuery: string,
    initialSelectedIndex: number,
    onFilter: (query: string, selectedIndex: number) => void
  ) {
    const input = container.createEl("input", { type: "text" });
    input.placeholder = `Search ${panel.id}…`;
    input.value = initialQuery;
    input.focus();
    panel.mount(container);
    if (initialSelectedIndex !== 0) {
      panel.updateSelection(0, initialSelectedIndex);
    }
    if (initialQuery) {
      panel.filter(initialQuery);
      if (initialSelectedIndex !== 0) {
        panel.updateSelection(0, initialSelectedIndex);
      }
      onFilter(initialQuery, initialSelectedIndex);
    }
    input.oninput = () => {
      const query = input.value.toLowerCase();
      onFilter(query, panel.filter(query));
    };
  }
}
