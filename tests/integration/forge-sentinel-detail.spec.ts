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
  });
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

  it('D1b: submitting the form calls onSubmit with filled name, description, and model', () => {
    const onSubmit = vi.fn();
    const { contentEl } = mountDetail({ onSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const nameInput = form.querySelector('input[type="text"]') as HTMLInputElement;
    const descTextarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const modelSelect = form.querySelector('select') as HTMLSelectElement;

    nameInput.value = 'X';
    descTextarea.value = 'Y';
    modelSelect.value = 'sonnet';

    form.dispatchEvent(new Event('submit'));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'X', description: 'Y', model: 'sonnet', effort: null });
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
