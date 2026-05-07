import type { KeyboardController } from '../KeyboardController';
import type { SupportedModel } from '../../domain/settings/Settings';

export interface ModelSelectOptions {
  container: HTMLElement;
  kb: KeyboardController;
  models: readonly SupportedModel[];
  initialModel: string;
  onChange: (modelId: string) => void;
}

function createModelSelectElement(
  models: readonly SupportedModel[],
  initialModel: string,
): HTMLSelectElement {
  const select = activeDocument.createEl('select');
  for (const m of models) {
    const opt = activeDocument.createEl('option');
    opt.value = m.id;
    opt.textContent = m.label;
    select.appendChild(opt);
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
  const select = createModelSelectElement(models, initialModel);
  select.addEventListener('change', () => onChange(select.value));
  bindModelSelectKeys(select, kb, onChange);
  container.appendChild(select);
  return select;
}
