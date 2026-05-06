import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../src/ui/components/ForgeSentinelDetail';
import type { Effort } from '../src/domain/settings/Settings';

// EffortRow is mocked so its document.createElement calls don't bleed into these unit tests
const { mockEffortMount, mockEffortUpdate } = vi.hoisted(() => ({
  mockEffortMount: vi.fn(),
  mockEffortUpdate: vi.fn(),
}));
vi.mock('../src/ui/widgets/EffortRow', () => ({
  EffortRow: vi.fn().mockImplementation(() => ({
    mount: mockEffortMount,
    update: mockEffortUpdate,
  })),
}));

type MockEl = {
  createEl: Mock;
  addClass: Mock;
  addEventListener: Mock;
  appendChild: Mock;
  onClickEvent: Mock;
  focus: Mock;
  value?: string;
};

type ScopeMock = Scope & { register: Mock; unregister: Mock };

// Only activeElement is needed; EffortRow (which uses createElement) is fully mocked
const mockDocument = { activeElement: null as unknown };
(global as Record<string, unknown>).document = mockDocument;

const createMockElement = () =>
  ({
    createEl: vi.fn(),
    addClass: vi.fn(),
    addEventListener: vi.fn(),
    appendChild: vi.fn(),
    onClickEvent: vi.fn(),
    focus: vi.fn(),
  }) as unknown as HTMLElement & MockEl;

const makeScope = (): ScopeMock =>
  ({ register: vi.fn(), unregister: vi.fn() }) as unknown as ScopeMock;

// ---------------------------------------------------------------------------
// Shared test-fixture builder
// ---------------------------------------------------------------------------
interface BuildOpts {
  defaultModel?: string;
  defaultEffort?: Effort | null;
  onBack?: Mock;
  onSubmit?: Mock;
  scope?: ScopeMock;
}

function buildDetail(opts: BuildOpts = {}) {
  const scope = opts.scope ?? makeScope();
  const container = createMockElement();
  const backButton = createMockElement();
  const form = createMockElement();

  container.createEl.mockImplementation((tag: string, attrs?: Record<string, string>) => {
    if (tag === 'button' && attrs?.text === '← Back') return backButton;
    if (tag === 'form') return form;
    return createMockElement();
  });

  const nameLabel = createMockElement();
  const descLabel = createMockElement();
  const modelLabel = createMockElement();
  let labelCount = 0;
  form.createEl.mockImplementation((tag: string) => {
    if (tag === 'label') {
      labelCount++;
      if (labelCount === 1) return nameLabel;
      if (labelCount === 2) return descLabel;
      return modelLabel; // label 3 = model select wrapper
    }
    return createMockElement();
  });

  const nameInput = { value: '', focus: vi.fn() };
  nameLabel.createEl.mockImplementation((tag: string) => {
    if (tag === 'input') return nameInput;
    return createMockElement();
  });

  const descInput = { value: '' };
  descLabel.createEl.mockImplementation((tag: string) => {
    if (tag === 'textarea') return descInput;
    return createMockElement();
  });

  const modelSelect = {
    value: opts.defaultModel ?? 'claude-sonnet-4-5',
    selectedIndex: 0,
    options: { length: 3 },
    createEl: vi.fn(() => createMockElement()),
    addEventListener: vi.fn(),
  };
  modelLabel.createEl.mockImplementation((tag: string) => {
    if (tag === 'select') return modelSelect;
    return createMockElement();
  });

  const callbacks = {
    onBack: opts.onBack ?? vi.fn(),
    onSubmit: opts.onSubmit ?? vi.fn(),
  };

  new ForgeSentinelDetail(container, scope, callbacks, {
    defaultModel: opts.defaultModel ?? 'claude-sonnet-4-5',
    defaultEffort: opts.defaultEffort !== undefined ? opts.defaultEffort : null,
  });

  const submitForm = () => {
    const handler = (form as unknown as HTMLFormElement).onsubmit;
    (handler as (e: Event) => void)({ preventDefault: vi.fn() } as unknown as Event);
  };

  const fireModelChange = () => {
    const changeCall = modelSelect.addEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'change'
    );
    if (changeCall) (changeCall as unknown[][])[1]();
  };

  return {
    container, form, backButton,
    nameLabel, descLabel, modelLabel,
    nameInput, descInput, modelSelect,
    callbacks, scope,
    submitForm, fireModelChange,
  };
}

// ---------------------------------------------------------------------------

describe('ForgeSentinelDetail', () => {
  beforeEach(() => {
    mockEffortMount.mockReset();
    mockEffortUpdate.mockReset();
    mockDocument.activeElement = null;
  });

  it('focuses the name input immediately on construction', () => {
    const { nameInput } = buildDetail();
    expect(nameInput.focus).toHaveBeenCalled();
  });

  it('renders a form element with CSS class forge-sentinel-form', () => {
    const { container, form } = buildDetail();
    expect(container.createEl.mock.calls.some((c: unknown[]) => c[0] === 'form')).toBe(true);
    expect(form.addClass).toHaveBeenCalledWith('forge-sentinel-form');
  });

  it('form contains name input with type="text"', () => {
    const { nameLabel } = buildDetail();
    expect(nameLabel.createEl).toHaveBeenCalledWith('input', { type: 'text', placeholder: 'Name' });
  });

  it('form contains description textarea', () => {
    const { descLabel } = buildDetail();
    expect(descLabel.createEl).toHaveBeenCalledWith('textarea', { placeholder: 'Description' });
  });

  it('model select has options from SUPPORTED_MODELS: haiku, sonnet, opus ids', () => {
    const { modelSelect } = buildDetail();
    const optionCalls = modelSelect.createEl.mock.calls.filter((c: unknown[]) => c[0] === 'option');
    expect(optionCalls.length).toBe(3);
    expect((optionCalls[0][1] as Record<string, string>)?.value).toBe('claude-haiku-4-5');
    expect((optionCalls[1][1] as Record<string, string>)?.value).toBe('claude-sonnet-4-5');
    expect((optionCalls[2][1] as Record<string, string>)?.value).toBe('claude-opus-4-5');
  });

  it('clicking back button calls onBack', () => {
    const onBack = vi.fn();
    const { container, backButton } = buildDetail({ onBack });
    expect(container.createEl).toHaveBeenCalledWith('button', { text: '← Back' });
    (backButton.onClickEvent.mock.calls[0] as unknown[][])[0]();
    expect(onBack).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EffortRow integration
  // -------------------------------------------------------------------------
  describe('EffortRow integration', () => {
    it('mounts EffortRow with SUPPORTED_MODELS and effort from FormDefaults', () => {
      buildDetail({ defaultModel: 'claude-opus-4-5', defaultEffort: 'high' });
      expect(mockEffortMount).toHaveBeenCalledOnce();
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { modelId: string; effort: Effort | null; models: unknown }];
      expect(mountOpts.modelId).toBe('claude-opus-4-5');
      expect(mountOpts.effort).toBe('high');
      expect(mountOpts.models).toBeDefined();
    });

    it('uses model defaultEffort when FormDefaults.defaultEffort is null (sonnet → medium)', () => {
      buildDetail({ defaultModel: 'claude-sonnet-4-5', defaultEffort: null });
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { effort: Effort | null }];
      expect(mountOpts.effort).toBe('medium');
    });

    it('uses null effort when model has no default effort (haiku)', () => {
      buildDetail({ defaultModel: 'claude-haiku-4-5', defaultEffort: null });
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { effort: Effort | null }];
      expect(mountOpts.effort).toBeNull();
    });

    it('calls EffortRow.update with new modelId and null when model select changes', () => {
      const { modelSelect, fireModelChange } = buildDetail({ defaultModel: 'claude-sonnet-4-5' });
      modelSelect.value = 'claude-opus-4-5';
      fireModelChange();
      expect(mockEffortUpdate).toHaveBeenCalledWith('claude-opus-4-5', null);
    });

    it('effort reported by EffortRow onChange is used in the next submit', () => {
      const onSubmit = vi.fn();
      const { submitForm } = buildDetail({ onSubmit, defaultEffort: 'medium' });

      // Simulate the user clicking a different segment in the EffortRow
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { onChange: (e: Effort) => void }];
      mountOpts.onChange('high');

      submitForm();
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ effort: 'high' }));
    });
  });

  // -------------------------------------------------------------------------
  // Form submission
  // -------------------------------------------------------------------------
  describe('form submission', () => {
    it('passes name, description, model, and effort snapshot to onSubmit', () => {
      const onSubmit = vi.fn();
      const { nameInput, descInput, modelSelect, submitForm } = buildDetail({
        onSubmit,
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: 'low',
      });
      nameInput.value = 'My Forge';
      descInput.value = 'A description';
      modelSelect.value = 'claude-opus-4-5';

      submitForm();

      expect(onSubmit).toHaveBeenCalledWith({
        name: 'My Forge',
        description: 'A description',
        model: 'claude-opus-4-5',
        effort: 'low',
      });
    });

    it('passes null effort when model has no default effort (haiku)', () => {
      const onSubmit = vi.fn();
      const { submitForm } = buildDetail({
        onSubmit,
        defaultModel: 'claude-haiku-4-5',
        defaultEffort: null,
      });
      submitForm();
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ effort: null }));
    });

    it('passes modelSelect.value directly without fallback', () => {
      const onSubmit = vi.fn();
      const { modelSelect, submitForm } = buildDetail({ onSubmit });
      modelSelect.value = '';
      submitForm();
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ model: '' }));
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard model cycling
  // -------------------------------------------------------------------------
  describe('keyboard model cycling', () => {
    const getHandler = (scope: ScopeMock, key: string) => {
      const call = scope.register.mock.calls.find((c: unknown[]) => c[1] === key) as unknown[];
      return () => (call[2] as (e: { preventDefault: Mock }) => void)({ preventDefault: vi.fn() });
    };

    it('registers ArrowDown and ArrowUp handlers on the provided scope', () => {
      const scope = makeScope();
      buildDetail({ scope });
      const keys = scope.register.mock.calls.map((c: unknown[]) => c[1]);
      expect(keys).toContain('ArrowDown');
      expect(keys).toContain('ArrowUp');
    });

    it('ArrowDown moves model select to next option', () => {
      const scope = makeScope();
      const { modelSelect } = buildDetail({ scope });
      modelSelect.selectedIndex = 0;
      mockDocument.activeElement = modelSelect;
      getHandler(scope, 'ArrowDown')();
      expect(modelSelect.selectedIndex).toBe(1);
    });

    it('ArrowDown wraps from last to first option', () => {
      const scope = makeScope();
      const { modelSelect } = buildDetail({ scope });
      modelSelect.selectedIndex = 2;
      mockDocument.activeElement = modelSelect;
      getHandler(scope, 'ArrowDown')();
      expect(modelSelect.selectedIndex).toBe(0);
    });

    it('ArrowUp moves model select to previous option', () => {
      const scope = makeScope();
      const { modelSelect } = buildDetail({ scope });
      modelSelect.selectedIndex = 2;
      mockDocument.activeElement = modelSelect;
      getHandler(scope, 'ArrowUp')();
      expect(modelSelect.selectedIndex).toBe(1);
    });

    it('ArrowUp wraps from first to last option', () => {
      const scope = makeScope();
      const { modelSelect } = buildDetail({ scope });
      modelSelect.selectedIndex = 0;
      mockDocument.activeElement = modelSelect;
      getHandler(scope, 'ArrowUp')();
      expect(modelSelect.selectedIndex).toBe(2);
    });
  });
});
