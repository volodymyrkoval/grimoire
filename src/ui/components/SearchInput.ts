import type { TabPanel } from "../tabs/TabPanel";

export class SearchInput {
  constructor(
    container: HTMLElement,
    panel: TabPanel,
    initialQuery: string,
    onFilter: (query: string, selectedIndex: number) => void
  ) {
    const input = container.createEl("input", { type: "text" });
    input.placeholder = `Search ${panel.id}…`;
    input.value = initialQuery;
    input.focus();
    panel.mount(container);
    if (initialQuery) {
      onFilter(initialQuery, panel.filter(initialQuery));
    }
    input.oninput = () => {
      const query = input.value.toLowerCase();
      onFilter(query, panel.filter(query));
    };
  }
}
