import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scope } from 'obsidian';
import { modelId } from '../../src/domain/settings/ModelId';
import { ForgeSentinelDetail } from '../../src/ui/components/ForgeSentinelDetail';
import type { ForgeFormSnapshot } from '../../src/forge/ForgeFormSnapshot';
import type { ForgeUpdateFormSnapshot } from '../../src/forge/ForgeUpdateFormSnapshot';
import type { ForgeMode } from '../../src/forge/ForgeMode';
import type { Spell } from '../../src/domain/spells/Spell';
import { spellPath } from '../../src/domain/spells/SpellPath';
import { buildHotkeyDirectory } from '../../src/forge/HotkeyDirectory';

// ─── Shared test fixtures ────────────────────────────────────────────────────

const DEFAULT_DEFAULTS = {
  defaultModel: modelId('sonnet'),
  defaultEffort: 'medium' as const,
};

const testSpell: Spell = {
  name: 'My Test Spell',
  path: spellPath('spells/my-test.md'),
  executeOnNote: false,
};

// ─── Mount helpers ────────────────────────────────────────────────────────────

type CreateCallbacks = {
  onBack?: () => void;
  onCreateSubmit?: (data: ForgeFormSnapshot) => void;
  onUpdateSubmit?: (data: ForgeUpdateFormSnapshot) => void;
};

function mountCreateMode(callbacks: CreateCallbacks = {}): {
  contentEl: HTMLElement;
  detail: ForgeSentinelDetail;
} {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(scope);
  const mode: ForgeMode = { kind: 'create' };
  detail.render({
    contentEl,
    mode,
    callbacks: {
      onBack: callbacks.onBack ?? vi.fn(),
      onCreateSubmit: callbacks.onCreateSubmit ?? vi.fn(),
      onUpdateSubmit: callbacks.onUpdateSubmit ?? vi.fn(),
    },
    defaults: DEFAULT_DEFAULTS,
    hotkey: {
      directory: buildHotkeyDirectory([]),
      eraser: vi.fn().mockResolvedValue(undefined),
    },
  });
  return { contentEl, detail };
}

function mountUpdateMode(
  spell: Spell,
  directiveCount: number,
  callbacks: CreateCallbacks = {},
): {
  contentEl: HTMLElement;
  detail: ForgeSentinelDetail;
} {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(scope);
  const mode: ForgeMode = { kind: 'update', spell, directiveCount };
  detail.render({
    contentEl,
    mode,
    callbacks: {
      onBack: callbacks.onBack ?? vi.fn(),
      onCreateSubmit: callbacks.onCreateSubmit ?? vi.fn(),
      onUpdateSubmit: callbacks.onUpdateSubmit ?? vi.fn(),
    },
    defaults: DEFAULT_DEFAULTS,
    hotkey: {
      directory: buildHotkeyDirectory([]),
      eraser: vi.fn().mockResolvedValue(undefined),
    },
  });
  return { contentEl, detail };
}

// ─── DOM cleanup ──────────────────────────────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── Assertion 1: create mode ─────────────────────────────────────────────────

describe('ForgeSentinelDetail — create mode', () => {
  it('A1a: renders a text input for name (not a static div)', () => {
    const { contentEl } = mountCreateMode();
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const nameInput = form.querySelector('input[type="text"]');
    expect(nameInput).not.toBeNull();
  });

  it('A1b: description textarea has intent-guiding placeholder', () => {
    const { contentEl } = mountCreateMode();
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.placeholder).toBe('What should this spell do?');
  });

  it('A1c: Execute on active note checkbox is present', () => {
    const { contentEl } = mountCreateMode();
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const eonCheckbox = form.querySelector('input[type="checkbox"][data-grimoire="execute-on-note"]');
    expect(eonCheckbox).not.toBeNull();
  });

  it('A1d: submitting calls onCreateSubmit with a ForgeFormSnapshot (name, description, model, effort, executeOnNote, no spellPath)', () => {
    const onCreateSubmit = vi.fn();
    const { contentEl } = mountCreateMode({ onCreateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const nameInput = form.querySelector('input[type="text"]') as HTMLInputElement;
    const descTextarea = form.querySelector('textarea') as HTMLTextAreaElement;
    nameInput.value = 'New Spell';
    descTextarea.value = 'Does something useful';

    form.dispatchEvent(new Event('submit'));

    expect(onCreateSubmit).toHaveBeenCalledOnce();
    const snapshot = onCreateSubmit.mock.calls[0][0] as ForgeFormSnapshot;
    expect(snapshot).toMatchObject({
      name: 'New Spell',
      description: 'Does something useful',
    });
    expect('spellPath' in snapshot).toBe(false);
  });
});

// ─── Assertion 2: update mode, directiveCount === 0 ──────────────────────────

describe('ForgeSentinelDetail — update mode (0 directives)', () => {
  it('A2a: renders a static div for name, NOT an editable name input', () => {
    const { contentEl } = mountUpdateMode(testSpell, 0);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    // Name should be shown as static text, not an editable input
    const nameInput = form.querySelector('input[type="text"]');
    expect(nameInput).toBeNull();
    // A div (or span) carrying the spell name should be present
    const nameDisplay = form.querySelector('[data-grimoire="spell-name"]');
    expect(nameDisplay).not.toBeNull();
  });

  it('A2b: description textarea placeholder is update-mode example hint', () => {
    const { contentEl } = mountUpdateMode(testSpell, 0);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('What to change, e.g. Handle code blocks too');
  });

  it('A2c: Execute on active note checkbox is absent', () => {
    const { contentEl } = mountUpdateMode(testSpell, 0);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const eonCheckbox = form.querySelector('input[type="checkbox"][data-grimoire="execute-on-note"]');
    expect(eonCheckbox).toBeNull();
  });

  it('A2d: Apply @cast directives checkbox is absent when directiveCount is 0', () => {
    const { contentEl } = mountUpdateMode(testSpell, 0);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const castCheckbox = form.querySelector('input[type="checkbox"][data-grimoire="apply-cast-directives"]');
    expect(castCheckbox).toBeNull();
  });

  it('A2e: submitting calls onUpdateSubmit with ForgeUpdateFormSnapshot including spellPath and applyCastDirectives: false', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode(testSpell, 0, { onUpdateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const descTextarea = form.querySelector('textarea') as HTMLTextAreaElement;
    descTextarea.value = 'Some change';

    form.dispatchEvent(new Event('submit'));

    expect(onUpdateSubmit).toHaveBeenCalledOnce();
    const snapshot = onUpdateSubmit.mock.calls[0][0] as ForgeUpdateFormSnapshot;
    expect(snapshot).toMatchObject({
      spellPath: testSpell.path,
      spellName: testSpell.name,
      applyCastDirectives: false,
      directiveCount: 0,
    });
  });
});

// ─── Assertion 3: update mode, directiveCount === 3 ──────────────────────────

describe('ForgeSentinelDetail — update mode (3 directives)', () => {
  it('A3a: Apply @cast directives checkbox is rendered, defaulted to checked', () => {
    const { contentEl } = mountUpdateMode(testSpell, 3);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]');
    expect(castCheckbox).not.toBeNull();
    expect(castCheckbox!.checked).toBe(true);
  });

  it('A3b: Apply @cast directives label includes "(3 directives found)"', () => {
    const { contentEl } = mountUpdateMode(testSpell, 3);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]');
    const label = castCheckbox!.closest('label');
    expect(label!.textContent).toContain('(3 directives found)');
  });

  it('A3c: unchecking the cast directives checkbox then submitting → applyCastDirectives: false in snapshot', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode(testSpell, 3, { onUpdateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const descTextarea = form.querySelector('textarea') as HTMLTextAreaElement;
    descTextarea.value = 'A change';
    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]')!;
    castCheckbox.checked = false;
    castCheckbox.dispatchEvent(new Event('change'));

    form.dispatchEvent(new Event('submit'));

    const snapshot = onUpdateSubmit.mock.calls[0][0] as ForgeUpdateFormSnapshot;
    expect(snapshot.applyCastDirectives).toBe(false);
  });

  it('A3d: submitting with cast directives checkbox checked → applyCastDirectives: true, directiveCount: 3', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode(testSpell, 3, { onUpdateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const descTextarea = form.querySelector('textarea') as HTMLTextAreaElement;
    descTextarea.value = 'A change';

    form.dispatchEvent(new Event('submit'));

    const snapshot = onUpdateSubmit.mock.calls[0][0] as ForgeUpdateFormSnapshot;
    expect(snapshot.applyCastDirectives).toBe(true);
    expect(snapshot.directiveCount).toBe(3);
  });
});

// ─── Assertion 4: directiveCount === 1, singular label ───────────────────────

describe('ForgeSentinelDetail — update mode (1 directive)', () => {
  it('A4: Apply @cast directives label uses singular "directive" for count of 1', () => {
    const { contentEl } = mountUpdateMode(testSpell, 1);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]');
    const label = castCheckbox!.closest('label');
    expect(label!.textContent).toContain('(1 directive found)');
  });
});

// ─── Assertion 5: submit-button disable rule in update mode ──────────────────

describe('ForgeSentinelDetail — update mode submit button enable/disable', () => {
  it('A5a: submit button is disabled when description is empty and cast directives checkbox is unchecked', () => {
    const { contentEl } = mountUpdateMode(testSpell, 3);
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;

    // Uncheck cast directives
    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]')!;
    castCheckbox.checked = false;
    castCheckbox.dispatchEvent(new Event('change'));

    // Description is empty (default)
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitBtn.disabled).toBe(true);
  });

  it('A5b: submit button is enabled when description has text', () => {
    const { contentEl } = mountUpdateMode(testSpell, 3);
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;

    // Uncheck cast directives so we isolate description as the enabler
    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]')!;
    castCheckbox.checked = false;
    castCheckbox.dispatchEvent(new Event('change'));

    const descTextarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
    descTextarea.value = 'Something useful';
    descTextarea.dispatchEvent(new Event('input'));

    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitBtn.disabled).toBe(false);
  });

  it('A5c: clearing description text re-disables the submit button', () => {
    const { contentEl } = mountUpdateMode(testSpell, 3);
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;

    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]')!;
    castCheckbox.checked = false;
    castCheckbox.dispatchEvent(new Event('change'));

    const descTextarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
    descTextarea.value = 'Something useful';
    descTextarea.dispatchEvent(new Event('input'));

    descTextarea.value = '';
    descTextarea.dispatchEvent(new Event('input'));

    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitBtn.disabled).toBe(true);
  });

  it('A5d: checking Apply @cast directives enables submit even with empty description', () => {
    const { contentEl } = mountUpdateMode(testSpell, 3);
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;

    // Start unchecked
    const castCheckbox = form.querySelector<HTMLInputElement>('input[type="checkbox"][data-grimoire="apply-cast-directives"]')!;
    castCheckbox.checked = false;
    castCheckbox.dispatchEvent(new Event('change'));

    // Description is empty — button should be disabled
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitBtn.disabled).toBe(true);

    // Now check cast directives — button should become enabled
    castCheckbox.checked = true;
    castCheckbox.dispatchEvent(new Event('change'));
    expect(submitBtn.disabled).toBe(false);
  });
});

// ------------------------------------------------------------------ A-D6
describe('ForgeSentinelDetail — apply-cast-directives D6 contract', () => {
  it('apply-cast-directives inner input fires handler on a raw change event (D6 contract)', () => {
    // Set up update mode with directives
    const { contentEl } = mountUpdateMode(testSpell, 2);
    const form = contentEl.querySelector('form.forge-sentinel-form')!;
    const castCheckbox = form.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-grimoire="apply-cast-directives"]',
    )!;
    expect(castCheckbox).not.toBeNull();

    // Initially checked (directiveCount > 0)
    expect(castCheckbox.checked).toBe(true);

    // Uncheck via raw DOM event — the change listener must update internal state
    castCheckbox.checked = false;
    castCheckbox.dispatchEvent(new Event('change'));

    // With applyCastDirectives=false and empty description, submit button must be disabled
    // (this confirms #handleApplyCastDirectivesChange ran and updated the enable rule)
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitBtn.disabled).toBe(true);
  });
});

// ─── Assertion 6: snapshot content in update mode ────────────────────────────

describe('ForgeSentinelDetail — update mode snapshot fields', () => {
  it('A6a: snapshot carries spellPath and spellName verbatim from mode.spell', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode(testSpell, 2, { onUpdateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const descTextarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
    descTextarea.value = 'Some update';
    form.dispatchEvent(new Event('submit'));

    const snapshot = onUpdateSubmit.mock.calls[0][0] as ForgeUpdateFormSnapshot;
    expect(snapshot.spellPath).toBe(testSpell.path);
    expect(snapshot.spellName).toBe(testSpell.name);
  });

  it('A6b: snapshot directiveCount matches the value from mode.directiveCount', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode(testSpell, 7, { onUpdateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const descTextarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
    descTextarea.value = 'Another update';
    form.dispatchEvent(new Event('submit'));

    const snapshot = onUpdateSubmit.mock.calls[0][0] as ForgeUpdateFormSnapshot;
    expect(snapshot.directiveCount).toBe(7);
  });

  it('A6c: snapshot does NOT contain a currentContent field', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode(testSpell, 2, { onUpdateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const descTextarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
    descTextarea.value = 'Some update';
    form.dispatchEvent(new Event('submit'));

    const snapshot = onUpdateSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect('currentContent' in snapshot).toBe(false);
  });
});
