import { describe, it, expect, vi } from 'vitest';
import { ForgeSentinelDetail } from '../src/ui/components/ForgeSentinelDetail';

describe('ForgeSentinelDetail', () => {
  const createMockElement = (): any => {
    return {
      createEl: vi.fn(),
      addClass: vi.fn(),
      createDiv: vi.fn(),
      createSpan: vi.fn(),
      addEventListener: vi.fn(),
      appendChild: vi.fn(),
      onClickEvent: vi.fn(),
    };
  };

  it('renders a form element with CSS class forge-sentinel-form', () => {
    const container = createMockElement();
    const button = createMockElement();
    const form = createMockElement();
    const label = createMockElement();
    const select = createMockElement();

    let callCount = 0;
    container.createEl.mockImplementation((tag: string) => {
      if (tag === 'button') return button;
      if (tag === 'form') return form;
      return createMockElement();
    });

    form.createEl.mockReturnValue(label);
    label.createEl.mockReturnValue(select);

    const callbacks = { onBack: vi.fn(), onSubmit: vi.fn() };
    new ForgeSentinelDetail(container, callbacks);

    // Verify form was created
    const formCall = container.createEl.mock.calls.find(
      (call: any[]) => call[0] === 'form'
    );
    expect(formCall).toBeDefined();
    expect(form.addClass).toHaveBeenCalledWith('forge-sentinel-form');
  });

  it('form contains name input with type="text"', () => {
    const container = createMockElement();
    const button = createMockElement();
    const form = createMockElement();
    const label = createMockElement();

    container.createEl.mockImplementation((tag: string) => {
      if (tag === 'button') return button;
      if (tag === 'form') return form;
      return createMockElement();
    });

    form.createEl.mockReturnValue(label);
    label.createEl.mockReturnValue(createMockElement());

    const callbacks = { onBack: vi.fn(), onSubmit: vi.fn() };
    new ForgeSentinelDetail(container, callbacks);

    // Verify first label was created for name
    const labelCalls = form.createEl.mock.calls.filter(
      (call: any[]) => call[0] === 'label'
    );
    expect(labelCalls.length).toBeGreaterThan(0);

    // Verify input was created in a label
    expect(label.createEl).toHaveBeenCalledWith('input', { type: 'text', placeholder: 'Name' });
  });

  it('form contains description textarea', () => {
    const container = createMockElement();
    const button = createMockElement();
    const form = createMockElement();
    const label = createMockElement();

    container.createEl.mockImplementation((tag: string) => {
      if (tag === 'button') return button;
      if (tag === 'form') return form;
      return createMockElement();
    });

    form.createEl.mockReturnValue(label);
    label.createEl.mockReturnValue(createMockElement());

    const callbacks = { onBack: vi.fn(), onSubmit: vi.fn() };
    new ForgeSentinelDetail(container, callbacks);

    // Verify textarea was created in a label
    expect(label.createEl).toHaveBeenCalledWith('textarea', { placeholder: 'Description' });
  });

  it('model select has options: haiku, sonnet, opus', () => {
    const container = createMockElement();
    const button = createMockElement();
    const form = createMockElement();
    const label = createMockElement();
    const select = createMockElement();

    container.createEl.mockImplementation((tag: string) => {
      if (tag === 'button') return button;
      if (tag === 'form') return form;
      return createMockElement();
    });

    form.createEl.mockReturnValue(label);

    label.createEl.mockImplementation((tag: string) => {
      if (tag === 'select') return select;
      return createMockElement();
    });

    select.createEl.mockReturnValue(createMockElement());

    const callbacks = { onBack: vi.fn(), onSubmit: vi.fn() };
    new ForgeSentinelDetail(container, callbacks);

    // Verify select was created
    expect(label.createEl).toHaveBeenCalledWith('select');

    // Verify options were created in select
    const optionCalls = select.createEl.mock.calls.filter(
      (call: any[]) => call[0] === 'option'
    );
    expect(optionCalls.length).toBe(3);
    expect(optionCalls[0][1]?.value).toBe('haiku');
    expect(optionCalls[1][1]?.value).toBe('sonnet');
    expect(optionCalls[2][1]?.value).toBe('opus');
  });

  it('clicking back button calls onBack', () => {
    const container = createMockElement();
    const button = createMockElement();
    const form = createMockElement();
    const label = createMockElement();

    container.createEl.mockImplementation((tag: string) => {
      if (tag === 'button') return button;
      if (tag === 'form') return form;
      return createMockElement();
    });

    form.createEl.mockReturnValue(label);
    label.createEl.mockReturnValue(createMockElement());

    const onBack = vi.fn();
    const callbacks = { onBack, onSubmit: vi.fn() };
    new ForgeSentinelDetail(container, callbacks);

    // Verify back button was created
    expect(container.createEl).toHaveBeenCalledWith('button', { text: '← Back' });

    // Simulate clicking the back button
    const clickCallback = button.onClickEvent.mock.calls[0][0];
    clickCallback();
    expect(onBack).toHaveBeenCalled();
  });

  it('submitting form calls onSubmit with ForgeFormData', () => {
    const container = createMockElement();
    const backButton = createMockElement();
    const form = createMockElement();
    const nameLabel = createMockElement();
    const descLabel = createMockElement();
    const modelLabel = createMockElement();
    const submitButton = createMockElement();
    const modelSelect = createMockElement();

    const nameInput = { value: 'My Forge' };
    const descInput = { value: 'A description' };
    modelSelect.value = 'opus';

    container.createEl.mockImplementation((tag: string) => {
      if (tag === 'button') return backButton;
      if (tag === 'form') return form;
      return createMockElement();
    });

    let labelCount = 0;
    form.createEl.mockImplementation((tag: string) => {
      if (tag === 'label') {
        labelCount++;
        if (labelCount === 1) return nameLabel;
        if (labelCount === 2) return descLabel;
        return modelLabel;
      }
      if (tag === 'button' && labelCount >= 3) return submitButton;
      return createMockElement();
    });

    nameLabel.createEl.mockImplementation((tag: string) => {
      if (tag === 'input') return nameInput;
      return createMockElement();
    });

    descLabel.createEl.mockImplementation((tag: string) => {
      if (tag === 'textarea') return descInput;
      return createMockElement();
    });

    modelLabel.createEl.mockImplementation((tag: string) => {
      if (tag === 'select') return modelSelect;
      return createMockElement();
    });

    const onSubmit = vi.fn();
    const callbacks = { onBack: vi.fn(), onSubmit };
    new ForgeSentinelDetail(container, callbacks);

    // Get the form submit handler that was set
    const formSubmitHandler = (form as any).onsubmit;
    expect(formSubmitHandler).toBeDefined();

    // Simulate form submission
    const event = { preventDefault: vi.fn() };
    formSubmitHandler(event);

    // Verify onSubmit was called with the form data
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'My Forge',
      description: 'A description',
      model: 'opus',
    });
  });
});
