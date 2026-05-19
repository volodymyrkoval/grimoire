/**
 * H0: RED integration tests — Forge dialog hotkey field.
 *
 * Seam: ForgeSentinelDetail rendered directly (same boundary as forge-sentinel-detail.spec.ts).
 * All 6 cases fail because the hotkey <input> does not exist in the current implementation.
 * The field (H2) and snapshot wiring (H3) will be added by senior-dev in Section H.
 *
 * How to type into the hotkey input:
 *   Set input.value then dispatch a bubbling 'input' event — the filter runs on 'input'.
 *   snapshot.hotkey is read from mock call args at submit.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scope } from 'obsidian';
import { modelId } from '../../src/domain/settings/ModelId';
import { ForgeSentinelDetail } from '../../src/ui/components/ForgeSentinelDetail';
import type { ForgeFormSnapshot } from '../../src/forge/ForgeFormSnapshot';
import type { ForgeUpdateFormSnapshot } from '../../src/forge/ForgeUpdateFormSnapshot';
import type { Spell } from '../../src/domain/spells/Spell';
import { spellPath } from '../../src/domain/spells/SpellPath';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOTKEY_PLACEHOLDER = 'Hotkey (1-2 letters, optional)';

const DEFAULT_DEFAULTS = {
  defaultModel: modelId('claude-sonnet-4-5'),
  defaultEffort: 'medium' as const,
};

// ─── Mount helpers ────────────────────────────────────────────────────────────

function mountCreateMode(callbacks: {
  onCreateSubmit?: (data: ForgeFormSnapshot) => void;
} = {}): { contentEl: HTMLElement; detail: ForgeSentinelDetail } {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(scope);
  detail.render({
    contentEl,
    mode: { kind: 'create' },
    callbacks: {
      onBack: vi.fn(),
      onCreateSubmit: callbacks.onCreateSubmit ?? vi.fn(),
      onUpdateSubmit: vi.fn(),
    },
    defaults: DEFAULT_DEFAULTS,
  });
  return { contentEl, detail };
}

function mountUpdateMode(
  spell: Spell,
  callbacks: { onUpdateSubmit?: (data: ForgeUpdateFormSnapshot) => void } = {},
): { contentEl: HTMLElement; detail: ForgeSentinelDetail } {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(scope);
  detail.render({
    contentEl,
    mode: { kind: 'update', spell, directiveCount: 0 },
    callbacks: {
      onBack: vi.fn(),
      onCreateSubmit: vi.fn(),
      onUpdateSubmit: callbacks.onUpdateSubmit ?? vi.fn(),
    },
    defaults: DEFAULT_DEFAULTS,
  });
  return { contentEl, detail };
}

/** Returns the hotkey text input from a rendered forge form, or null if absent. */
function getHotkeyInput(contentEl: HTMLElement): HTMLInputElement | null {
  return contentEl.querySelector<HTMLInputElement>(
    `input[placeholder="${HOTKEY_PLACEHOLDER}"]`,
  );
}

/** Types into the hotkey input by setting its value and firing the 'input' event. */
function typeIntoHotkeyInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── DOM cleanup ──────────────────────────────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── Test cases ───────────────────────────────────────────────────────────────

describe('H0: Forge dialog hotkey field', () => {
  it('(i) type "g" into hotkey input then submit — imprintAction called with snapshot.hotkey === "g"', () => {
    const onCreateSubmit = vi.fn();
    const { contentEl } = mountCreateMode({ onCreateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const hotkeyInput = getHotkeyInput(contentEl);
    expect(hotkeyInput, 'hotkey input must exist').not.toBeNull();

    typeIntoHotkeyInput(hotkeyInput!, 'g');
    form.dispatchEvent(new Event('submit'));

    expect(onCreateSubmit).toHaveBeenCalledOnce();
    const snapshot = onCreateSubmit.mock.calls[0][0] as ForgeFormSnapshot;
    expect((snapshot as any).hotkey).toBe('g');
  });

  it('(ii) submit with empty hotkey input — snapshot.hotkey === null', () => {
    const onCreateSubmit = vi.fn();
    const { contentEl } = mountCreateMode({ onCreateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    // Ensure hotkey input exists but is empty
    const hotkeyInput = getHotkeyInput(contentEl);
    expect(hotkeyInput, 'hotkey input must exist').not.toBeNull();
    // Do not type anything — leave the input empty

    form.dispatchEvent(new Event('submit'));

    expect(onCreateSubmit).toHaveBeenCalledOnce();
    const snapshot = onCreateSubmit.mock.calls[0][0] as ForgeFormSnapshot;
    expect((snapshot as any).hotkey).toBeNull();
  });

  it('(iii) type "Go" — input value snaps to lowercase "go"', () => {
    const { contentEl } = mountCreateMode();

    const hotkeyInput = getHotkeyInput(contentEl);
    expect(hotkeyInput, 'hotkey input must exist').not.toBeNull();

    typeIntoHotkeyInput(hotkeyInput!, 'Go');

    expect(hotkeyInput!.value).toBe('go');
  });

  it('(iv) type "1" then "a" — input value is "a" (digit rejected, letter accepted)', () => {
    const { contentEl } = mountCreateMode();

    const hotkeyInput = getHotkeyInput(contentEl);
    expect(hotkeyInput, 'hotkey input must exist').not.toBeNull();

    // First keystroke: digit '1' — filter should reject and restore to ''
    typeIntoHotkeyInput(hotkeyInput!, '1');
    // Second keystroke: letter 'a' — filter should accept
    typeIntoHotkeyInput(hotkeyInput!, 'a');

    expect(hotkeyInput!.value).toBe('a');
  });

  it('(v) type "abc" — input value is capped at "ab" (max 2 chars)', () => {
    const { contentEl } = mountCreateMode();

    const hotkeyInput = getHotkeyInput(contentEl);
    expect(hotkeyInput, 'hotkey input must exist').not.toBeNull();

    typeIntoHotkeyInput(hotkeyInput!, 'abc');

    expect(hotkeyInput!.value).toBe('ab');
  });

  it('(vi) forge-update mode with spell.hotkey "r" — input pre-filled with "r"; clear and submit → snapshot.hotkey === null', () => {
    const onUpdateSubmit = vi.fn();
    const spellWithHotkey: Spell = {
      name: 'My Refine Spell',
      path: spellPath('spells/my-refine.md'),
      executeOnNote: false,
      hotkey: 'r' as any, // Hotkey branded type; 'r' is valid per parseHotkey
    };

    const { contentEl } = mountUpdateMode(spellWithHotkey, { onUpdateSubmit });

    const hotkeyInput = getHotkeyInput(contentEl);
    expect(hotkeyInput, 'hotkey input must exist in update mode').not.toBeNull();

    // Assert pre-filled with the spell's hotkey
    expect(hotkeyInput!.value).toBe('r');

    // Clear the input and submit
    typeIntoHotkeyInput(hotkeyInput!, '');
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    expect(onUpdateSubmit).toHaveBeenCalledOnce();
    const snapshot = onUpdateSubmit.mock.calls[0][0] as ForgeUpdateFormSnapshot;
    expect((snapshot as any).hotkey).toBeNull();
  });
});
