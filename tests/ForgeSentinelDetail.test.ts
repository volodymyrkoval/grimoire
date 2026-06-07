/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../src/ui/components/ForgeSentinelDetail';
import { SUPPORTED_MODELS } from '../src/domain/settings/Settings';
import type { Effort } from '../src/domain/settings/Settings';
import { modelId, type ModelId } from '../src/domain/settings/ModelId';
import { buildHotkeyDirectory } from '../src/forge/HotkeyDirectory';
import { CLAUDE_CODE } from '../src/domain/settings/Provider';

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

/** Minimal hotkey group used by all tests that don't exercise hotkey behaviour. */
const testHotkey = () => ({
  directory: buildHotkeyDirectory([]),
  eraser: vi.fn().mockResolvedValue(undefined),
});

// ---------------------------------------------------------------------------
// Shared test-fixture builder
// ---------------------------------------------------------------------------
interface BuildOpts {
  defaultModel?: ModelId;
  defaultEffort?: Effort | null;
  onBack?: ReturnType<typeof vi.fn>;
  onCreateSubmit?: ReturnType<typeof vi.fn>;
  scope?: ScopeMock;
}

function buildDetail(opts: BuildOpts = {}) {
  const scope = opts.scope ?? makeScope();
  const container = document.createElement('div');
  document.body.appendChild(container);

  const callbacks = {
    onBack: opts.onBack ?? vi.fn(),
    onCreateSubmit: opts.onCreateSubmit ?? vi.fn(),
    onUpdateSubmit: vi.fn(),
  };

  const detail = new ForgeSentinelDetail(scope);
  detail.render({
    contentEl: container,
    mode: { kind: 'create' },
    callbacks,
    defaults: {
      defaultModel: opts.defaultModel ?? modelId('sonnet'),
      defaultEffort: opts.defaultEffort !== undefined ? opts.defaultEffort : null,
      defaultProvider: CLAUDE_CODE,
    },
    hotkey: testHotkey(),
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

  it('focuses the name input immediately on render', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');

    const detail = new ForgeSentinelDetail(makeScope());
    detail.render({
      contentEl: container,
      mode: { kind: 'create' },
      callbacks: { onBack: vi.fn(), onCreateSubmit: vi.fn(), onUpdateSubmit: vi.fn() },
      defaults: { defaultModel: modelId('sonnet'), defaultEffort: null, defaultProvider: CLAUDE_CODE },
      hotkey: testHotkey(),
    });

    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it('renders a form element with CSS class forge-sentinel-form', () => {
    const { container, form } = buildDetail();
    expect(container.contains(form)).toBe(true);
    expect(form.className).toBe('forge-sentinel-form');
  });

  it('form contains name input with type="text" and example placeholder', () => {
    const { nameInput } = buildDetail();
    expect(nameInput).not.toBeNull();
    expect(nameInput.type).toBe('text');
    expect(nameInput.placeholder).toBe('Spell name, e.g. Summarize note');
  });

  it('form contains description textarea with intent-guiding placeholder', () => {
    const { descInput } = buildDetail();
    expect(descInput).not.toBeNull();
    expect(descInput.placeholder).toBe('What should this spell do?');
  });

  it('model select has options from SUPPORTED_MODELS: haiku, sonnet, opus ids', () => {
    const { modelSelect } = buildDetail();
    expect(modelSelect.options.length).toBe(3);
    expect(modelSelect.options[0].value).toBe('haiku');
    expect(modelSelect.options[1].value).toBe('sonnet');
    expect(modelSelect.options[2].value).toBe('opus');
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
      (b) => b.textContent?.includes('← back'),
    ) as HTMLButtonElement;
    expect(backBtn).not.toBeNull();
    backBtn.click();
    expect(onBack).toHaveBeenCalled();
  });

  it('destroy() prevents back button from invoking onBack on subsequent click', () => {
    const onBack = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const detail = new ForgeSentinelDetail(makeScope());
    detail.render({
      contentEl: container,
      mode: { kind: 'create' },
      callbacks: { onBack, onCreateSubmit: vi.fn(), onUpdateSubmit: vi.fn() },
      defaults: { defaultModel: modelId('sonnet'), defaultEffort: null, defaultProvider: CLAUDE_CODE },
      hotkey: testHotkey(),
    });

    detail.destroy();

    const backBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('← back'),
    ) as HTMLButtonElement;
    expect(backBtn).not.toBeNull();
    backBtn.click();

    expect(onBack).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EffortRow integration
  // -------------------------------------------------------------------------
  describe('EffortRow integration', () => {
    it('mounts EffortRow with SUPPORTED_MODELS and effort from FormDefaults', () => {
      buildDetail({ defaultModel: modelId('opus'), defaultEffort: 'high' });
      expect(mockEffortMount).toHaveBeenCalledOnce();
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { modelId: string; effort: Effort | null; models: unknown }];
      expect(mountOpts.modelId).toBe('opus');
      expect(mountOpts.effort).toBe('high');
      expect(mountOpts.models).toBeDefined();
    });

    it('uses model defaultEffort when FormDefaults.defaultEffort is null (sonnet → medium)', () => {
      buildDetail({ defaultModel: modelId('sonnet'), defaultEffort: null });
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { effort: Effort | null }];
      expect(mountOpts.effort).toBe('medium');
    });

    it('uses null effort when model has no default effort (haiku)', () => {
      buildDetail({ defaultModel: modelId('haiku'), defaultEffort: null });
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { effort: Effort | null }];
      expect(mountOpts.effort).toBeNull();
    });

    it('calls EffortRow.update with new modelId and null when model select changes', () => {
      const { modelSelect, fireModelChange } = buildDetail({ defaultModel: modelId('sonnet') });
      modelSelect.value = 'opus';
      fireModelChange();
      expect(mockEffortUpdate).toHaveBeenCalledWith(modelId('opus'), null);
    });

    it('effort reported by EffortRow onChange is used in the next submit', () => {
      const onCreateSubmit = vi.fn();
      const { submitForm } = buildDetail({ onCreateSubmit, defaultEffort: 'medium' });

      // Simulate the user clicking a different segment in the EffortRow
      const [, mountOpts] = mockEffortMount.mock.calls[0] as [unknown, { onChange: (e: Effort) => void }];
      mountOpts.onChange('high');

      submitForm();
      expect(onCreateSubmit).toHaveBeenCalledWith(expect.objectContaining({ effort: 'high' }));
    });
  });

  // -------------------------------------------------------------------------
  // Provider in snapshots (F2)
  // -------------------------------------------------------------------------
  describe('provider in snapshots', () => {
    it('create snapshot includes provider: CLAUDE_CODE', () => {
      const onCreateSubmit = vi.fn();
      const { nameInput, descInput, submitForm } = buildDetail({ onCreateSubmit });
      nameInput.value = 'Test';
      descInput.value = 'desc';
      submitForm();
      expect(onCreateSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ provider: CLAUDE_CODE }),
      );
    });

    it('update snapshot includes provider: CLAUDE_CODE', () => {
      const scope = makeScope();
      const container = document.createElement('div');
      document.body.appendChild(container);

      const onUpdateSubmit = vi.fn();
      const detail = new ForgeSentinelDetail(scope);
      const fakeSpell = {
        path: 'spells/test.md' as any,
        name: 'Test Spell',
        basename: 'test',
        tags: [] as string[],
        executeOnNote: false,
        hotkey: null,
      };
      detail.render({
        contentEl: container,
        mode: { kind: 'update', spell: fakeSpell, directiveCount: 0 },
        callbacks: { onBack: vi.fn(), onCreateSubmit: vi.fn(), onUpdateSubmit },
        defaults: {
          defaultModel: modelId('sonnet'),
          defaultEffort: null,
          defaultProvider: CLAUDE_CODE,
        },
        hotkey: testHotkey(),
      });

      const form = container.querySelector<HTMLFormElement>('form')!;
      const descInput = container.querySelector<HTMLTextAreaElement>('textarea')!;
      descInput.value = 'Some update description';
      form.dispatchEvent(new Event('submit', { bubbles: true }));

      expect(onUpdateSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ provider: CLAUDE_CODE }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Form submission
  // -------------------------------------------------------------------------
  describe('form submission', () => {
    it('passes name, description, model, and effort snapshot to onCreateSubmit', () => {
      const onCreateSubmit = vi.fn();
      const { nameInput, descInput, modelSelect, submitForm } = buildDetail({
        onCreateSubmit,
        defaultModel: modelId('sonnet'),
        defaultEffort: 'low',
      });
      nameInput.value = 'My Forge';
      descInput.value = 'A description';
      modelSelect.value = 'opus';

      submitForm();

      expect(onCreateSubmit).toHaveBeenCalledWith({
        name: 'My Forge',
        description: 'A description',
        model: 'opus',
        effort: 'low',
        executeOnNote: true,
        provider: CLAUDE_CODE,
      });
    });

    it('passes null effort when model has no default effort (haiku)', () => {
      const onCreateSubmit = vi.fn();
      const { submitForm } = buildDetail({
        onCreateSubmit,
        defaultModel: modelId('haiku'),
        defaultEffort: null,
      });
      submitForm();
      expect(onCreateSubmit).toHaveBeenCalledWith(expect.objectContaining({ effort: null }));
    });

    it('passes modelSelect.value directly without fallback', () => {
      const onCreateSubmit = vi.fn();
      const { modelSelect, submitForm } = buildDetail({ onCreateSubmit });
      // In happy-dom, setting value to empty string on a select with options
      // won't actually change the value; use the first option's value
      modelSelect.value = modelSelect.options[0].value;
      submitForm();
      expect(onCreateSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ model: modelSelect.value }),
      );
    });

    it('includes executeOnNote: true by default on submit', () => {
      const onCreateSubmit = vi.fn();
      const { submitForm } = buildDetail({ onCreateSubmit });
      submitForm();
      expect(onCreateSubmit).toHaveBeenCalledWith(expect.objectContaining({ executeOnNote: true }));
    });

    it('includes executeOnNote: false after unchecking the checkbox', () => {
      const onCreateSubmit = vi.fn();
      const { form, submitForm } = buildDetail({ onCreateSubmit });
      const eonCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="execute-on-note"]')!;
      expect(eonCheckbox).not.toBeNull();
      eonCheckbox.checked = false;
      eonCheckbox.dispatchEvent(new Event('change'));
      submitForm();
      expect(onCreateSubmit).toHaveBeenCalledWith(expect.objectContaining({ executeOnNote: false }));
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
