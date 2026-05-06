import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../../src/ui/components/ForgeSentinelDetail';
import { EffortRow } from '../../src/ui/widgets/EffortRow';

function mountDetail(callbacks: {
  onBack?: () => void;
  onSubmit?: (data: { name: string; description: string; model: string }) => void;
}): { contentEl: HTMLElement; detail: ForgeSentinelDetail; scope: Scope } {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(contentEl, scope, {
    onBack: callbacks.onBack ?? vi.fn(),
    onSubmit: callbacks.onSubmit ?? vi.fn(),
  }, { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' });
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

  it('D1b: submitting the form calls onSubmit with filled name, description, model, and effort', () => {
    const onSubmit = vi.fn();
    // Mount with Sonnet defaults (has effort options: low/medium/high/max)
    const { contentEl } = mountDetail({ onSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const nameInput = form.querySelector('input[type="text"]') as HTMLInputElement;
    const descTextarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const modelSelect = form.querySelector('select') as HTMLSelectElement;

    nameInput.value = 'X';
    descTextarea.value = 'Y';
    // Keep model as Sonnet (default) and click the 'high' effort button
    expect(modelSelect.value).toBe('claude-sonnet-4-5');
    const highBtn = form.querySelector('.grimoire-effort-row .grimoire-segmented__btn[textContent="high"], .grimoire-effort-row .grimoire-segmented__btn') as HTMLButtonElement | null;
    // Find the 'high' button by text content
    const effortBtns = Array.from(form.querySelectorAll('.grimoire-effort-row .grimoire-segmented__btn'));
    const highButton = effortBtns.find((b) => b.textContent === 'high') as HTMLButtonElement;
    expect(highButton).toBeTruthy();
    highButton.click();

    form.dispatchEvent(new Event('submit'));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'X', description: 'Y', model: 'claude-sonnet-4-5', effort: 'high' });
  });

  it('D1b-haiku: switching model to Haiku removes effort row from DOM', () => {
    const { contentEl } = mountDetail({});

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    // Effort row is present initially (Sonnet default)
    expect(form.querySelector('.grimoire-effort-row')).toBeTruthy();

    const modelSelect = form.querySelector('select') as HTMLSelectElement;
    modelSelect.value = 'claude-haiku-4-5';
    modelSelect.dispatchEvent(new Event('change'));

    // Effort row should be removed for Haiku (no effortOptions)
    expect(form.querySelector('.grimoire-effort-row')).toBeNull();
  });

  it('D1c: clicking the Back button calls onBack', () => {
    const onBack = vi.fn();
    const { contentEl } = mountDetail({ onBack });

    const buttons = Array.from(contentEl.querySelectorAll('button'));
    const backBtn = buttons.find((b) => b.textContent?.includes('← Back'));
    expect(backBtn).toBeTruthy();

    backBtn!.dispatchEvent(new Event('click'));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('D1e: switching Haiku→Sonnet re-mounts effort row before the Submit button (not after)', () => {
    const contentEl = document.createElement('div');
    document.body.appendChild(contentEl);
    const scope = new Scope();
    const detail = new ForgeSentinelDetail(contentEl, scope, {
      onBack: vi.fn(),
      onSubmit: vi.fn(),
    }, { defaultModel: 'claude-haiku-4-5', defaultEffort: null });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;

    // Haiku has no effort options — row should be absent initially
    expect(form.querySelector('.grimoire-effort-row')).toBeNull();

    const modelSelect = form.querySelector('select') as HTMLSelectElement;
    modelSelect.value = 'claude-sonnet-4-5';
    modelSelect.dispatchEvent(new Event('change'));

    // Effort row should now be present
    expect(form.querySelector('.grimoire-effort-row')).toBeTruthy();

    // Effort row container must appear BEFORE the Submit button in the form
    const allFormChildren = Array.from(form.children);
    const effortIdx = allFormChildren.findIndex(el => el.querySelector('.grimoire-effort-row') !== null);
    const submitIdx = allFormChildren.findIndex(el => el.matches('button[type="submit"]'));
    expect(effortIdx).toBeGreaterThanOrEqual(0);
    expect(effortIdx).toBeLessThan(submitIdx);

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

    expect(updateSpy).toHaveBeenCalledWith('claude-opus-4-5', null);
    updateSpy.mockRestore();
  });
});
