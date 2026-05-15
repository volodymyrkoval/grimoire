import type { KeyboardController } from '../../infra/KeyboardController';
import type { SupportedModel } from '../../domain/settings/Settings';

export interface ModelSelectOptions {
  container: HTMLElement;
  kb: KeyboardController;
  models: readonly SupportedModel[];
  initialModel: string;
  onChange: (modelId: string) => void;
}

function createModelSelectElement(
  container: HTMLElement,
  models: readonly SupportedModel[],
  initialModel: string,
): HTMLSelectElement {
  const select = container.createEl('select');
  for (const m of models) {
    const opt = select.createEl('option', { text: m.label });
    opt.value = m.id;
  }
  select.value = initialModel;
  return select;
}

function bindModelSelectKeys(
  select: HTMLSelectElement,
  kb: KeyboardController,
  onChange: (modelId: string) => void,
): void {
  kb.bind([], 'ArrowDown', () => {
    if (activeDocument.activeElement !== select) return false;
    select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
    onChange(select.value);
    return true;
  });
  kb.bind([], 'ArrowUp', () => {
    if (activeDocument.activeElement !== select) return false;
    select.selectedIndex =
      (select.selectedIndex - 1 + select.options.length) % select.options.length;
    onChange(select.value);
    return true;
  });
}

export function buildModelSelect({
  container,
  kb,
  models,
  initialModel,
  onChange,
}: ModelSelectOptions): HTMLSelectElement {
  const select = createModelSelectElement(container, models, initialModel);
  select.addEventListener('change', () => onChange(select.value));
  bindModelSelectKeys(select, kb, onChange);
  return select;
}
