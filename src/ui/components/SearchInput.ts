import type { TabPanel } from "../tabs/TabPanel";

type FilterCallback = (query: string, selectedIndex: number) => void;

export class SearchInput {
  constructor(
    container: HTMLElement,
    panel: TabPanel,
    initialQuery: string,
    initialSelectedIndex: number,
    onFilter: FilterCallback
  ) {
    const input = this.#createInput(container, panel, initialQuery);
    panel.mount(container);
    this.#restoreSelection(panel, initialSelectedIndex);
    this.#applyInitialFilter(panel, initialQuery, initialSelectedIndex, onFilter);
    this.#bindInputHandler(input, panel, onFilter);
  }

  #createInput(container: HTMLElement, panel: TabPanel, initialQuery: string): HTMLInputElement {
    const input = container.createEl("input", { type: "text", cls: "grimoire-search-input" });
    input.placeholder = `Search ${panel.id}…`;
    input.value = initialQuery;
    input.focus();
    return input;
  }

  #restoreSelection(panel: TabPanel, selectedIndex: number): void {
    if (selectedIndex !== 0) {
      panel.updateSelection(0, selectedIndex);
    }
  }

  #applyInitialFilter(
    panel: TabPanel,
    initialQuery: string,
    initialSelectedIndex: number,
    onFilter: FilterCallback
  ): void {
    if (!initialQuery) return;
    panel.filter(initialQuery);
    this.#restoreSelection(panel, initialSelectedIndex);
    onFilter(initialQuery, initialSelectedIndex);
  }

  #bindInputHandler(input: HTMLInputElement, panel: TabPanel, onFilter: FilterCallback): void {
    input.oninput = () => {
      const query = input.value.toLowerCase();
      onFilter(query, panel.filter(query));
    };
  }
}
