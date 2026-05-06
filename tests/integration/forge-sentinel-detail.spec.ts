import { describe, it, expect, vi } from 'vitest';
import { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../../src/ui/components/ForgeSentinelDetail';

function mountDetail(callbacks: {
  onBack?: () => void;
  onSubmit?: (data: { name: string; description: string; model: string }) => void;
}): { contentEl: HTMLElement; detail: ForgeSentinelDetail } {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(contentEl, scope, {
    onBack: callbacks.onBack ?? vi.fn(),
    onSubmit: callbacks.onSubmit ?? vi.fn(),
  }, { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' });
  return { contentEl, detail };
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
});
