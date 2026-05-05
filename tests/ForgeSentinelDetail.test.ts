import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../src/ui/components/ForgeSentinelDetail';

type MockEl = {
  createEl: Mock;
  addClass: Mock;
  createDiv: Mock;
  createSpan: Mock;
  addEventListener: Mock;
  appendChild: Mock;
  onClickEvent: Mock;
  focus: Mock;
  value?: string;
};

type ScopeMock = Scope & { register: Mock; unregister: Mock };

const mockDocument = { activeElement: null as unknown };
(global as Record<string, unknown>).document = mockDocument;

describe('ForgeSentinelDetail', () => {
  const createMockElement = () =>
    ({
      createEl: vi.fn(),
      addClass: vi.fn(),
      createDiv: vi.fn(),
      createSpan: vi.fn(),
      addEventListener: vi.fn(),
      appendChild: vi.fn(),
      onClickEvent: vi.fn(),
      focus: vi.fn(),
    }) as unknown as HTMLElement & MockEl;

  const makeScope = (): ScopeMock =>
    ({
      register: vi.fn(),
      unregister: vi.fn(),
    }) as unknown as ScopeMock;

  it('focuses the name input immediately on construction', () => {
    const container = createMockElement();
    const form = createMockElement();
    const nameLabel = createMockElement();
    const otherLabel = createMockElement();
    const nameInput = { focus: vi.fn() };
    const select = createMockElement();
    select.createEl = vi.fn(() => createMockElement()) as unknown as typeof select.createEl;

    container.createEl.mockImplementation((tag: string) => {
      if (tag === 'button') return createMockElement();
      if (tag === 'form') return form;
      return createMockElement();
    });

    let labelCount = 0;
    form.createEl.mockImplementation((tag: string) => {
      if (tag === 'label') return ++labelCount === 1 ? nameLabel : otherLabel;
      return createMockElement();
    });

    nameLabel.createEl.mockReturnValue(nameInput);
    otherLabel.createEl.mockImplementation((tag: string) => {
      if (tag === 'select') return select;
      return createMockElement();
    });

    const callbacks = { onBack: vi.fn(), onSubmit: vi.fn() };
    new ForgeSentinelDetail(container, makeScope(), callbacks);

    expect(nameInput.focus).toHaveBeenCalled();
  });

  it('renders a form element with CSS class forge-sentinel-form', () => {
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
    label.createEl.mockReturnValue(select);

    const callbacks = { onBack: vi.fn(), onSubmit: vi.fn() };
    new ForgeSentinelDetail(container, makeScope(), callbacks);

    // Verify form was created
    const formCall = container.createEl.mock.calls.find(
      (call) => call[0] === 'form'
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
    new ForgeSentinelDetail(container, makeScope(), callbacks);

    // Verify first label was created for name
    const labelCalls = form.createEl.mock.calls.filter(
      (call) => call[0] === 'label'
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
    new ForgeSentinelDetail(container, makeScope(), callbacks);

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
    new ForgeSentinelDetail(container, makeScope(), callbacks);

    // Verify select was created
    expect(label.createEl).toHaveBeenCalledWith('select');

    // Verify options were created in select
    const optionCalls = select.createEl.mock.calls.filter(
      (call) => call[0] === 'option'
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
    new ForgeSentinelDetail(container, makeScope(), callbacks);

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

    const nameInput = { value: 'My Forge', focus: vi.fn() };
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
    new ForgeSentinelDetail(container, makeScope(), callbacks);

    // Get the form submit handler that was set
    const formSubmitHandler = (form as unknown as HTMLFormElement).onsubmit;
    expect(formSubmitHandler).toBeDefined();

    // Simulate form submission
    const event = { preventDefault: vi.fn() };
    (formSubmitHandler as unknown as (event: SubmitEvent) => void)(event as unknown as SubmitEvent);

    // Verify onSubmit was called with the form data
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'My Forge',
      description: 'A description',
      model: 'opus',
    });
  });

  describe('with scope — keyboard model cycling', () => {
    const makeScope = (): ScopeMock =>
      ({
        register: vi.fn(),
        unregister: vi.fn(),
      }) as unknown as ScopeMock;

    const buildDetail = (scope: ScopeMock) => {
      const container = createMockElement();
      const button = createMockElement();
      const form = createMockElement();
      const label = createMockElement();
      const select = {
        selectedIndex: 0,
        options: { length: 3 },
        createEl: vi.fn(() => createMockElement()),
      };

      container.createEl.mockImplementation((tag: string) => {
        if (tag === 'button') return button;
        if (tag === 'form') return form;
        return createMockElement();
      });
      form.createEl.mockImplementation((tag: string) => {
        if (tag === 'label') return label;
        return createMockElement();
      });
      label.createEl.mockImplementation((tag: string) => {
        if (tag === 'select') return select;
        return createMockElement();
      });

      const callbacks = { onBack: vi.fn(), onSubmit: vi.fn() };
      new ForgeSentinelDetail(container, scope, callbacks);
      return { scope, select, callbacks };
    };

    const getHandler = (scope: ScopeMock, key: string) => {
      const call = scope.register.mock.calls.find((c) => c[1] === key);
      // The raw scope.register callback wraps the handler; invoke with a fake event
      return () => call[2]({ preventDefault: vi.fn() });
    };

    it('registers ArrowDown and ArrowUp handlers on the provided scope', () => {
      const scope = makeScope();
      buildDetail(scope);

      const keys = scope.register.mock.calls.map((c) => c[1]);
      expect(keys).toContain('ArrowDown');
      expect(keys).toContain('ArrowUp');
    });

    it('ArrowDown moves model select to next option', () => {
      const scope = makeScope();
      const { select } = buildDetail(scope);
      select.selectedIndex = 0;
      mockDocument.activeElement = select;

      getHandler(scope, 'ArrowDown')();

      expect(select.selectedIndex).toBe(1);
    });

    it('ArrowDown wraps from last to first option', () => {
      const scope = makeScope();
      const { select } = buildDetail(scope);
      select.selectedIndex = 2; // opus — last
      mockDocument.activeElement = select;

      getHandler(scope, 'ArrowDown')();

      expect(select.selectedIndex).toBe(0);
    });

    it('ArrowUp moves model select to previous option', () => {
      const scope = makeScope();
      const { select } = buildDetail(scope);
      select.selectedIndex = 2;
      mockDocument.activeElement = select;

      getHandler(scope, 'ArrowUp')();

      expect(select.selectedIndex).toBe(1);
    });

    it('ArrowUp wraps from first to last option', () => {
      const scope = makeScope();
      const { select } = buildDetail(scope);
      select.selectedIndex = 0;
      mockDocument.activeElement = select;

      getHandler(scope, 'ArrowUp')();

      expect(select.selectedIndex).toBe(2);
    });

    // Cleanup of FSD's scope bindings is the parent's responsibility (it calls
    // destroy() before resuming its own keys). Coverage of that integration
    // lives in CommandPopup.test.ts ('after close() … ArrowDown moves …').
  });
});
