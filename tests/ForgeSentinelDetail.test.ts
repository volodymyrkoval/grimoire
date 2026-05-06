/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../src/ui/components/ForgeSentinelDetail';
import { SUPPORTED_MODELS } from '../src/domain/settings/Settings';
import type { Effort } from '../src/domain/settings/Settings';

// EffortRow is mocked so its DOM interactions don't bleed into these unit tests
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

type ScopeMock = Scope & { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

const makeScope = (): ScopeMock =>
  ({ register: vi.fn(), unregister: vi.fn() }) as unknown as ScopeMock;

// ---------------------------------------------------------------------------
// Shared test-fixture builder
// ---------------------------------------------------------------------------
interface BuildOpts {
  defaultModel?: string;
  defaultEffort?: Effort | null;
  onBack?: ReturnType<typeof vi.fn>;
  onSubmit?: ReturnType<typeof vi.fn>;
  scope?: ScopeMock;
}

function buildDetail(opts: BuildOpts = {}) {
  const scope = opts.scope ?? makeScope();
  const container = document.createElement('div');
  document.body.appendChild(container);

  const callbacks = {
    onBack: opts.onBack ?? vi.fn(),
    onSubmit: opts.onSubmit ?? vi.fn(),
  };

  new ForgeSentinelDetail({
    contentEl: container,
    scope,
    callbacks,
    defaults: {
      defaultModel: opts.defaultModel ?? 'claude-sonnet-4-5',
      defaultEffort: opts.defaultEffort !== undefined ? opts.defaultEffort : null,
    },
  });

  const form = container.querySelector<HTMLFormElement>('form')!;
  const nameInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;
  const descInput = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const modelSelect = container.querySelector<HTMLSelectElement>('select')!;

  const submitForm = () => {
    form.dispatchEvent(new Event('submit', { bubbles: true }));
  };

  const fireModelChange = () => {
    modelSelect.dispatchEvent(new Event('change', { bubbles: false }));
  };

  return {
    container, form,
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
    document.body.innerHTML = '';
  });

  it('focuses the name input immediately on construction', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');

    new ForgeSentinelDetail({
      contentEl: container,
      scope: makeScope(),
      callbacks: { onBack: vi.fn(), onSubmit: vi.fn() },
      defaults: { defaultModel: 'claude-sonnet-4-5', defaultEffort: null },
    });

    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it('renders a form element with CSS class forge-sentinel-form', () => {
    const { container, form } = buildDetail();
    expect(container.contains(form)).toBe(true);
    expect(form.className).toBe('forge-sentinel-form');
  });

  it('form contains name input with type="text" and placeholder="Name"', () => {
    const { nameInput } = buildDetail();
    expect(nameInput).not.toBeNull();
    expect(nameInput.type).toBe('text');
    expect(nameInput.placeholder).toBe('Name');
  });

  it('form contains description textarea with placeholder="Description"', () => {
    const { descInput } = buildDetail();
    expect(descInput).not.toBeNull();
    expect(descInput.placeholder).toBe('Description');
  });

  it('model select has options from SUPPORTED_MODELS: haiku, sonnet, opus ids', () => {
    const { modelSelect } = buildDetail();
    expect(modelSelect.options.length).toBe(3);
    expect(modelSelect.options[0].value).toBe('claude-haiku-4-5');
    expect(modelSelect.options[1].value).toBe('claude-sonnet-4-5');
    expect(modelSelect.options[2].value).toBe('claude-opus-4-5');
  });

  it('model select labels match SUPPORTED_MODELS labels', () => {
    const { modelSelect } = buildDetail();
    for (let i = 0; i < SUPPORTED_MODELS.length; i++) {
      expect(modelSelect.options[i].textContent).toBe(SUPPORTED_MODELS[i].label);
    }
  });

  it('clicking back button calls onBack', () => {
    const onBack = vi.fn();
    const { container } = buildDetail({ onBack });
    const backBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('← Back'),
    ) as HTMLButtonElement;
    expect(backBtn).not.toBeNull();
    backBtn.click();
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
      // In happy-dom, setting value to empty string on a select with options
      // won't actually change the value; use the first option's value
      modelSelect.value = modelSelect.options[0].value;
      submitForm();
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ model: modelSelect.value }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard model cycling
  // -------------------------------------------------------------------------
  describe('keyboard model cycling', () => {
    const getHandler = (scope: ScopeMock, key: string) => {
      const call = scope.register.mock.calls.find((c: unknown[]) => c[1] === key) as unknown[];
      return () => (call[2] as (e: { preventDefault: ReturnType<typeof vi.fn> }) => void)({ preventDefault: vi.fn() });
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
      modelSelect.focus();
      getHandler(scope, 'ArrowDown')();
      expect(modelSelect.selectedIndex).toBe(1);
    });

    it('ArrowDown wraps from last to first option', () => {
      const scope = makeScope();
      const { modelSelect } = buildDetail({ scope });
      modelSelect.selectedIndex = 2;
      modelSelect.focus();
      getHandler(scope, 'ArrowDown')();
      expect(modelSelect.selectedIndex).toBe(0);
    });

    it('ArrowUp moves model select to previous option', () => {
      const scope = makeScope();
      const { modelSelect } = buildDetail({ scope });
      modelSelect.selectedIndex = 2;
      modelSelect.focus();
      getHandler(scope, 'ArrowUp')();
      expect(modelSelect.selectedIndex).toBe(1);
    });

    it('ArrowUp wraps from first to last option', () => {
      const scope = makeScope();
      const { modelSelect } = buildDetail({ scope });
      modelSelect.selectedIndex = 0;
      modelSelect.focus();
      getHandler(scope, 'ArrowUp')();
      expect(modelSelect.selectedIndex).toBe(2);
    });
  });
});
