import { modelId } from '../../src/domain/settings/ModelId';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../../src/ui/components/ForgeSentinelDetail';
import { EffortRow } from '../../src/ui/widgets/EffortRow';
import type { ForgeFormSnapshot } from '../../src/forge/ForgeFormSnapshot';
import { buildHotkeyDirectory } from '../../src/forge/HotkeyDirectory';

function mountDetail(callbacks: {
  onBack?: () => void;
  onCreateSubmit?: (data: ForgeFormSnapshot) => void;
}): { contentEl: HTMLElement; detail: ForgeSentinelDetail; scope: Scope } {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(scope);
  detail.render({
    contentEl,
    mode: { kind: 'create' },
    callbacks: {
      onBack: callbacks.onBack ?? vi.fn(),
      onCreateSubmit: callbacks.onCreateSubmit ?? vi.fn(),
      onUpdateSubmit: vi.fn(),
    },
    defaults: { defaultModel: modelId('sonnet'), defaultEffort: 'medium' },
    hotkey: {
      directory: buildHotkeyDirectory([]),
      eraser: vi.fn().mockResolvedValue(undefined),
    },
  });
  return { contentEl, detail, scope };
}

describe('ForgeSentinelDetail component', () => {
  it('D1a: after construction, document.activeElement is the name input inside the form', () => {
    const { contentEl } = mountDetail({});

    const form = contentEl.querySelector('form.forge-sentinel-form');
    expect(form).toBeTruthy();
    const nameInput = form!.querySelector('input[type="text"]');
    expect(nameInput).toBeTruthy();
    // input.focus() is called during construction — activeElement should be name input
    expect(document.activeElement).toBe(nameInput);
  });

  it('D1b: submitting the form calls onCreateSubmit with filled name, description, model, and effort', () => {
    const onCreateSubmit = vi.fn();
    // Mount with Sonnet defaults (has effort options: low/medium/high/max)
    const { contentEl } = mountDetail({ onCreateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const nameInput = form.querySelector('input[type="text"]') as HTMLInputElement;
    const descTextarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const modelSelect = form.querySelector('select') as HTMLSelectElement;

    nameInput.value = 'X';
    descTextarea.value = 'Y';
    // Keep model as Sonnet (default) and click the 'high' effort button
    expect(modelSelect.value).toBe('sonnet');
    const highBtn = form.querySelector('.grimoire-effort-row .grimoire-segmented__btn[textContent="high"], .grimoire-effort-row .grimoire-segmented__btn') as HTMLButtonElement | null;
    // Find the 'high' button by text content
    const effortBtns = Array.from(form.querySelectorAll('.grimoire-effort-row .grimoire-segmented__btn'));
    const highButton = effortBtns.find((b) => b.textContent === 'high') as HTMLButtonElement;
    expect(highButton).toBeTruthy();
    highButton.click();

    form.dispatchEvent(new Event('submit'));

    expect(onCreateSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'X', description: 'Y', model: modelId('sonnet'), effort: 'high' }));
  });

  it('D1b-haiku: switching model to Haiku removes effort row from DOM', () => {
    const { contentEl } = mountDetail({});

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    // Effort row is present initially (Sonnet default)
    expect(form.querySelector('.grimoire-effort-row')).toBeTruthy();

    const modelSelect = form.querySelector('select') as HTMLSelectElement;
    modelSelect.value = 'haiku';
    modelSelect.dispatchEvent(new Event('change'));

    // Effort row should be removed for Haiku (no effortOptions)
    expect(form.querySelector('.grimoire-effort-row')).toBeNull();
  });

  it('D1c: clicking the Back button calls onBack', () => {
    const onBack = vi.fn();
    const { contentEl } = mountDetail({ onBack });

    const buttons = Array.from(contentEl.querySelectorAll('button'));
    const backBtn = buttons.find((b) => b.textContent?.includes('← back'));
    expect(backBtn).toBeTruthy();

    backBtn!.dispatchEvent(new Event('click'));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('D1e: switching Haiku→Sonnet re-mounts effort row before the Submit button (not after)', () => {
    const contentEl = document.createElement('div');
    document.body.appendChild(contentEl);
    const scope = new Scope();
    const detail = new ForgeSentinelDetail(scope);
    detail.render({
      contentEl,
      mode: { kind: 'create' },
      callbacks: { onBack: vi.fn(), onCreateSubmit: vi.fn(), onUpdateSubmit: vi.fn() },
      defaults: { defaultModel: modelId('haiku'), defaultEffort: null },
      hotkey: {
        directory: buildHotkeyDirectory([]),
        eraser: vi.fn().mockResolvedValue(undefined),
      },
    });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;

    // Haiku has no effort options — row should be absent initially
    expect(form.querySelector('.grimoire-effort-row')).toBeNull();

    const modelSelect = form.querySelector('select') as HTMLSelectElement;
    modelSelect.value = 'sonnet';
    modelSelect.dispatchEvent(new Event('change'));

    // Effort row should now be present
    expect(form.querySelector('.grimoire-effort-row')).toBeTruthy();

    // Effort row container must appear BEFORE the Submit button in the form (document order agnostic)
    const effortEl = form.querySelector('.grimoire-effort-row');
    const buttonRow = form.querySelector('.grimoire-button-row');
    expect(effortEl).not.toBeNull();
    expect(buttonRow).not.toBeNull();
    // effort row must appear before the submit button row in document order
    expect(effortEl!.compareDocumentPosition(buttonRow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    detail.destroy();
    document.body.removeChild(contentEl);
  });

  it('D1d: ArrowDown on focused model select calls EffortRow.update with the new model id', () => {
    const updateSpy = vi.spyOn(EffortRow.prototype, 'update');
    const { contentEl, scope } = mountDetail({});

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const modelSelect = form.querySelector('select') as HTMLSelectElement;
    // Default is sonnet (index 1); ArrowDown moves to opus (index 2)
    modelSelect.focus();

    (scope as unknown as { dispatch(k: string, m: string[]): boolean }).dispatch('ArrowDown', []);

    expect(updateSpy).toHaveBeenCalledWith('opus', null);
    updateSpy.mockRestore();
  });

  it('E0.1: form renders a checkbox with data-grimoire="execute-on-note"', () => {
    const { contentEl } = mountDetail({});
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const eonCheckbox = form.querySelector('input[type="checkbox"][data-grimoire="execute-on-note"]');
    expect(eonCheckbox).not.toBeNull();
  });

  it('E0.2: executeOnNote checkbox starts checked by default', () => {
    const { contentEl } = mountDetail({});
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const eonCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="execute-on-note"]')!;
    expect(eonCheckbox.checked).toBe(true);
  });

  it('E0.3: submitting with default checkbox emits executeOnNote: true', () => {
    const onCreateSubmit = vi.fn();
    const { contentEl } = mountDetail({ onCreateSubmit });
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    expect(onCreateSubmit).toHaveBeenCalledWith(expect.objectContaining({ executeOnNote: true }));
  });

  it('E0.4: unchecking then submitting emits executeOnNote: false', () => {
    const onCreateSubmit = vi.fn();
    const { contentEl } = mountDetail({ onCreateSubmit });
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const eonCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="execute-on-note"]')!;
    eonCheckbox.checked = false;
    eonCheckbox.dispatchEvent(new Event('change'));
    form.dispatchEvent(new Event('submit'));
    expect(onCreateSubmit).toHaveBeenCalledWith(expect.objectContaining({ executeOnNote: false }));
  });

  it('E0.5: executeOnNote checkbox does not appear between effort-row and Submit button', () => {
    const contentEl = document.createElement('div');
    document.body.appendChild(contentEl);
    const scope = new Scope();
    const detail = new ForgeSentinelDetail(scope);
    detail.render({
      contentEl,
      mode: { kind: 'create' },
      callbacks: { onBack: vi.fn(), onCreateSubmit: vi.fn(), onUpdateSubmit: vi.fn() },
      defaults: { defaultModel: modelId('haiku'), defaultEffort: null },
      hotkey: {
        directory: buildHotkeyDirectory([]),
        eraser: vi.fn().mockResolvedValue(undefined),
      },
    });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const modelSelect = form.querySelector('select') as HTMLSelectElement;
    modelSelect.value = 'sonnet';
    modelSelect.dispatchEvent(new Event('change'));

    const effortEl = form.querySelector('.grimoire-effort-row');
    const buttonRow = form.querySelector('.grimoire-button-row');
    const eonCheckbox = form.querySelector('input[data-grimoire="execute-on-note"]');

    expect(effortEl).not.toBeNull();
    expect(buttonRow).not.toBeNull();
    expect(eonCheckbox).not.toBeNull();

    // effort row must appear before the submit button row in document order
    expect(effortEl!.compareDocumentPosition(buttonRow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // executeOnNote checkbox must NOT be between effort row and submit button
    // (i.e., eon must precede effort OR follow submit)
    const eonBeforeEffort = eonCheckbox!.compareDocumentPosition(effortEl!) & Node.DOCUMENT_POSITION_FOLLOWING;
    const eonAfterSubmit = buttonRow!.compareDocumentPosition(eonCheckbox!) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(eonBeforeEffort || eonAfterSubmit).toBeTruthy();

    detail.destroy();
    document.body.removeChild(contentEl);
  });
});
