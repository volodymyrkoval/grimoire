import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scope } from 'obsidian';
import { ForgeSentinelDetail } from '../../src/ui/components/ForgeSentinelDetail';
import { buildHotkeyDirectory } from '../../src/forge/HotkeyDirectory';
import { spellPath } from '../../src/domain/spells/SpellPath';
import { parseHotkey } from '../../src/domain/spells/Hotkey';
import { modelId } from '../../src/domain/settings/ModelId';
import type { Spell } from '../../src/domain/spells/Spell';
import type { ForgeFormSnapshot } from '../../src/forge/ForgeFormSnapshot';
import type { ForgeUpdateFormSnapshot } from '../../src/forge/ForgeUpdateFormSnapshot';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SPELL_PATH = spellPath('spells/my-spell.md');

const SPELL_WITH_HOTKEY: Spell = {
  name: 'My Spell',
  path: SPELL_PATH,
  executeOnNote: false,
  hotkey: parseHotkey('g'),
};

const SPELL_NO_HOTKEY: Spell = {
  name: 'My Spell',
  path: SPELL_PATH,
  executeOnNote: false,
  hotkey: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mountCreateMode(opts: {
  onCreateSubmit?: (s: ForgeFormSnapshot) => void;
  directory?: ReturnType<typeof buildHotkeyDirectory>;
  eraser?: (path: string) => Promise<void>;
}): { contentEl: HTMLElement; detail: ForgeSentinelDetail } {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(scope);
  const directory = opts.directory ?? buildHotkeyDirectory([]);
  const eraser = opts.eraser ?? vi.fn().mockResolvedValue(undefined);
  detail.render({
    contentEl,
    mode: { kind: 'create' },
    callbacks: {
      onBack: vi.fn(),
      onCreateSubmit: opts.onCreateSubmit ?? vi.fn(),
      onUpdateSubmit: vi.fn(),
    },
    defaults: { defaultModel: modelId('sonnet'), defaultEffort: 'medium' },
    hotkey: { directory, eraser },
  });
  return { contentEl, detail };
}

function mountUpdateMode(opts: {
  spell: Spell;
  onUpdateSubmit?: (s: ForgeUpdateFormSnapshot) => void;
  directory?: ReturnType<typeof buildHotkeyDirectory>;
  eraser?: (path: string) => Promise<void>;
  writer?: (path: string, hotkey: string) => Promise<void>;
}): { contentEl: HTMLElement; detail: ForgeSentinelDetail; eraser: (path: string) => Promise<void>; writer: (path: string, hotkey: string) => Promise<void> } {
  const contentEl = document.createElement('div');
  document.body.appendChild(contentEl);
  const scope = new Scope();
  const detail = new ForgeSentinelDetail(scope);
  const directory = opts.directory ?? buildHotkeyDirectory([]);
  const eraser = opts.eraser ?? vi.fn().mockResolvedValue(undefined);
  const writer = opts.writer ?? vi.fn().mockResolvedValue(undefined);
  detail.render({
    contentEl,
    mode: { kind: 'update', spell: opts.spell, directiveCount: 0 },
    callbacks: {
      onBack: vi.fn(),
      onCreateSubmit: vi.fn(),
      onUpdateSubmit: opts.onUpdateSubmit ?? vi.fn(),
    },
    defaults: { defaultModel: modelId('sonnet'), defaultEffort: 'medium' },
    hotkey: { directory, eraser, writer },
  });
  return { contentEl, detail, eraser, writer };
}

/**
 * Fires a keydown event on the given container element.
 * The HotkeyCaptureField binds its keydown listener on the container.
 */
function fireKey(container: HTMLElement, key: string, opts?: KeyboardEventInit): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  container.dispatchEvent(event);
}

/**
 * Finds the hotkey field container — the element that wraps the .grimoire-hotkey-button.
 * Returns the parent element of the button (or the button's closest container div/section).
 */
function findHotkeyContainer(contentEl: HTMLElement): HTMLElement {
  const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLElement | null;
  if (!btn) throw new Error('grimoire-hotkey-button not found in DOM');
  // The container owns the keydown listener; walk up to find a dedicated wrapper.
  // The field renders itself inside a wrapping element with data-grimoire="hotkey-field".
  const wrapper = btn.closest('[data-grimoire="hotkey-field"]') as HTMLElement | null;
  if (wrapper) return wrapper;
  // Fallback: parent element
  return btn.parentElement as HTMLElement;
}

// ─── DOM cleanup ──────────────────────────────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── Case 1: Default state — no persisted hotkey ──────────────────────────────

describe('C1: default state with no persisted hotkey (update mode)', () => {
  it('renders a button with class grimoire-hotkey-button and text "Hotkey"', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Hotkey');
  });

  it('renders no chip (.grimoire-hotkey-chip) initially', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });
    expect(contentEl.querySelector('.grimoire-hotkey-chip')).toBeNull();
  });

  it('renders no clear button (.grimoire-hotkey-clear) initially', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });
    expect(contentEl.querySelector('.grimoire-hotkey-clear')).toBeNull();
  });

  it('create mode has no hotkey field', () => {
    const { contentEl } = mountCreateMode({});
    expect(contentEl.querySelector('.grimoire-hotkey-button')).toBeNull();
  });
});

// ─── Case 2: Default state — with persisted hotkey (update mode) ──────────────

describe('C2: default state with persisted hotkey in update mode', () => {
  it('renders a chip with class grimoire-hotkey-chip containing the hotkey text', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY });

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('g');
  });

  it('renders a persisted-chip clear button (.grimoire-hotkey-clear)', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY });
    expect(contentEl.querySelector('.grimoire-hotkey-clear')).not.toBeNull();
  });

  it('renders chip BEFORE the Hotkey button in the DOM', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY });

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement;
    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    expect(btn).not.toBeNull();

    // chip must appear after the button in document order
    const position = btn.compareDocumentPosition(chip);
    // DOCUMENT_POSITION_FOLLOWING === 4 means chip comes after btn
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ─── Case 2b: Hotkey field wrapper is a dedicated layout block ────────────────

describe('C2b: hotkey field wrapper layout contract (update mode)', () => {
  it('wraps the field in a .grimoire-hotkey-field block, not a bare div', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const wrapper = findHotkeyContainer(contentEl);
    expect(wrapper.classList.contains('grimoire-hotkey-field')).toBe(true);
  });

  it('renders the wrapper between the back button and the form', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const backBtn = contentEl.querySelector('button') as HTMLButtonElement;
    const wrapper = contentEl.querySelector('.grimoire-hotkey-field') as HTMLElement;
    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    expect(backBtn).not.toBeNull();
    expect(wrapper).not.toBeNull();
    expect(form).not.toBeNull();

    // back button precedes the wrapper, wrapper precedes the form
    expect(backBtn.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ─── Case 3: Click button → capture state ────────────────────────────────────

describe('C3: click Hotkey button enters capture state', () => {
  it('changes button label from "Hotkey" to "Save"', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    expect(btn.textContent).toBe('Save');
  });

  it('shows a .grimoire-hotkey-chip after entering capture', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    expect(contentEl.querySelector('.grimoire-hotkey-chip')).not.toBeNull();
  });

  it('shows a .grimoire-hotkey-clear button after entering capture', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    expect(contentEl.querySelector('.grimoire-hotkey-clear')).not.toBeNull();
  });
});

// ─── Case 4: Keystroke appends to buffer ─────────────────────────────────────

describe('C4: keystroke appends to capture buffer', () => {
  it('first letter appears in chip', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });
    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement;
    expect(chip.textContent).toContain('g');
  });

  it('second letter extends chip to two letters', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });
    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');
    fireKey(container, 'o');

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement;
    expect(chip.textContent).toContain('go');
  });

  it('third letter is ignored — chip stays at two letters', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });
    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');
    fireKey(container, 'o');
    fireKey(container, 'x');

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement;
    expect(chip.textContent).toBe('go');
  });
});

// ─── Case 5: Backspace removes last letter ────────────────────────────────────

describe('C5: Backspace removes last letter from buffer', () => {
  it('removes second letter when Backspace is pressed', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });
    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');
    fireKey(container, 'o');
    fireKey(container, 'Backspace');

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement;
    expect(chip.textContent).toBe('g');
  });
});

// ─── Case 5b: Modified Backspace is ignored ───────────────────────────────────

describe('C5b: Modified Backspace does not alter the capture buffer', () => {
  it('leaves buffer unchanged when Ctrl+Backspace is fired during capture', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });
    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');
    fireKey(container, 'o');
    fireKey(container, 'Backspace', { ctrlKey: true });

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement;
    expect(chip.textContent).toBe('go');
  });
});

// ─── Case 6: Enter commits (valid) — form submit does NOT fire ────────────────

describe('C6: Enter commits valid capture; form submit is NOT triggered', () => {
  it('chip disappears from capture; persisted chip "g" appears; onUpdateSubmit not called', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY, onUpdateSubmit });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');
    fireKey(container, 'Enter');

    // Must NOT have submitted the form
    expect(onUpdateSubmit).not.toHaveBeenCalled();

    // Button should return to "Hotkey" label (default state)
    expect(btn.textContent).toBe('Hotkey');

    // Persisted chip showing "g" should be visible
    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('g');
  });
});

// ─── Case 7: Click "Save" commits (valid) ────────────────────────────────────

describe('C7: clicking Save button commits valid capture', () => {
  it('field returns to default state with persisted chip "g"', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');

    // At this point btn.textContent === 'Save'; click it
    btn.click();

    expect(btn.textContent).toBe('Hotkey');
    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('g');
  });
});

// ─── Case 8: Click "×" during capture → cancel ───────────────────────────────

describe('C8: clicking × during capture cancels without persisting', () => {
  it('restores persisted chip "g"; no "z" chip remains', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'z');

    // Click the capture × (there may be two × buttons in DOM if persisted was also shown,
    // but in capture state the persisted chip × should be replaced by the capture × only)
    const clearBtn = contentEl.querySelector('.grimoire-hotkey-clear') as HTMLButtonElement;
    clearBtn.click();

    // Field returns to default state — button back to "Hotkey"
    expect(btn.textContent).toBe('Hotkey');

    // Persisted chip "g" is back
    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('g');

    // No "z" chip
    const allChips = contentEl.querySelectorAll('.grimoire-hotkey-chip');
    for (const c of allChips) {
      expect(c.textContent).not.toContain('z');
    }
  });
});

// ─── Case 9: Click "×" on persisted chip → eraser called ─────────────────────

describe('C9: clicking × on persisted chip calls the eraser', () => {
  it('calls eraser with SPELL_PATH, then removes chip', async () => {
    const eraser = vi.fn().mockResolvedValue(undefined);
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY, eraser });

    const clearBtn = contentEl.querySelector('.grimoire-hotkey-clear') as HTMLButtonElement;
    clearBtn.click();

    expect(eraser).toHaveBeenCalledWith(SPELL_PATH);

    await vi.waitFor(() => {
      expect(contentEl.querySelector('.grimoire-hotkey-chip')).toBeNull();
    });

    // Hotkey button still present
    expect(contentEl.querySelector('.grimoire-hotkey-button')).not.toBeNull();
  });
});

// ─── Case 10: Invalid commits ─────────────────────────────────────────────────

describe('C10: invalid commits', () => {
  describe('10a: pattern violation — empty buffer', () => {
    it('chip gets .is-error; error text "One or two lowercase letters only." appears; stays in capture', () => {
      const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

      const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
      btn.click();
      // Don't type anything — empty buffer

      btn.click(); // click Save

      const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
      expect(chip).not.toBeNull();
      expect(chip!.classList.contains('is-error')).toBe(true);

      expect(contentEl.textContent).toContain('One or two lowercase letters only.');

      // Still in capture state
      expect(btn.textContent).toBe('Save');
    });
  });

  describe('10b: reserved-forge — "f"', () => {
    it('chip gets .is-error; error text "Reserved for Forge." appears', () => {
      const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

      const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
      btn.click();

      const container = findHotkeyContainer(contentEl);
      fireKey(container, 'f');

      btn.click(); // click Save

      const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
      expect(chip).not.toBeNull();
      expect(chip!.classList.contains('is-error')).toBe(true);

      expect(contentEl.textContent).toContain('Reserved for Forge.');
    });
  });

  describe('10c: collision — hotkey already used by another spell', () => {
    it('chip gets .is-error; error text includes "Hotkey already used by" and the colliding spell name', () => {
      const OTHER_PATH = spellPath('spells/other-spell.md');
      const otherSpell: Spell = {
        name: 'Other Spell',
        path: OTHER_PATH,
        executeOnNote: false,
        hotkey: parseHotkey('g'),
      };
      const directory = buildHotkeyDirectory([otherSpell]);

      const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY, directory });

      const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
      btn.click();

      const container = findHotkeyContainer(contentEl);
      fireKey(container, 'g');

      btn.click(); // click Save

      const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
      expect(chip).not.toBeNull();
      expect(chip!.classList.contains('is-error')).toBe(true);

      expect(contentEl.textContent).toContain('Hotkey already used by');
      expect(contentEl.textContent).toContain('Other Spell');
    });
  });
});

// ─── Case 11: Self-save in update mode → ok ───────────────────────────────────

describe('C11: self-save in update mode (same hotkey) succeeds', () => {
  it('field returns to default state with chip "g"; no error', () => {
    // Directory includes SPELL_WITH_HOTKEY itself — selfPath should be excluded from collision check
    const directory = buildHotkeyDirectory([SPELL_WITH_HOTKEY]);

    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY, directory });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');

    btn.click(); // click Save

    // Should succeed — return to default
    expect(btn.textContent).toBe('Hotkey');

    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.classList.contains('is-error')).toBe(false);
    expect(chip!.textContent).toContain('g');
  });
});

// ─── Case 12: Tab away → cancel ──────────────────────────────────────────────

describe('C12: tab away from field cancels capture state', () => {
  it('focusout with relatedTarget outside container restores persisted chip "g"', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    // Verify we're in capture state
    expect(btn.textContent).toBe('Save');

    const container = findHotkeyContainer(contentEl);
    const focusoutEvent = new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: document.body,
    });
    container.dispatchEvent(focusoutEvent);

    // Field should return to default state
    expect(btn.textContent).toBe('Hotkey');

    // Persisted chip "g" should be restored
    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('g');
  });
});

// ─── Case 13: No auto-focus on Hotkey button at open ─────────────────────────

describe('C13: opening Forge dialog does not auto-focus the hotkey button', () => {
  it('after render, document.activeElement is NOT the .grimoire-hotkey-button', () => {
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY });

    const hotkeyBtn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    expect(document.activeElement).not.toBe(hotkeyBtn);
  });
});

// ─── Case 14: Writer / auto-save integrity ────────────────────────────────────

describe('C14: writer auto-save integrity', () => {
  it('14a: create mode submit snapshot has no hotkey field', () => {
    const onCreateSubmit = vi.fn();
    const { contentEl } = mountCreateMode({ onCreateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const nameInput = form.querySelector('input[type="text"]') as HTMLInputElement;
    nameInput.value = 'My Spell';
    form.dispatchEvent(new Event('submit'));

    expect(onCreateSubmit).toHaveBeenCalledOnce();
    const snapshot = onCreateSubmit.mock.calls[0][0] as ForgeFormSnapshot;
    expect(snapshot).not.toHaveProperty('hotkey');
  });

  it('14b: writer spy is called with spell path and "g" when hotkey "g" is committed in update mode', () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const { contentEl } = mountUpdateMode({ spell: SPELL_NO_HOTKEY, writer });

    const btn = contentEl.querySelector('.grimoire-hotkey-button') as HTMLButtonElement;
    btn.click();

    const container = findHotkeyContainer(contentEl);
    fireKey(container, 'g');
    btn.click(); // Save

    expect(writer).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledWith(SPELL_PATH, 'g');
  });

  it('14c: update mode submit snapshot has no hotkey field', () => {
    const onUpdateSubmit = vi.fn();
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY, onUpdateSubmit });

    const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'some change';
    textarea.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));

    expect(onUpdateSubmit).toHaveBeenCalledOnce();
    const snapshot = onUpdateSubmit.mock.calls[0][0] as ForgeUpdateFormSnapshot;
    expect(snapshot).not.toHaveProperty('hotkey');
  });
});

// ─── Case 15: Eraser identity ─────────────────────────────────────────────────

describe('C15: eraser identity — spy passed in is the one invoked on × click', () => {
  it('the eraser spy is called when the persisted-chip × is clicked', async () => {
    const eraser = vi.fn().mockResolvedValue(undefined);
    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY, eraser });

    const clearBtn = contentEl.querySelector('.grimoire-hotkey-clear') as HTMLButtonElement;
    clearBtn.click();

    expect(eraser).toHaveBeenCalledOnce();
    expect(eraser).toHaveBeenCalledWith(SPELL_PATH);
  });
});

// ─── D6: Eraser failure path ──────────────────────────────────────────────────

describe('D6: eraser failure — "Could not clear hotkey." shown; retry succeeds', () => {
  it('shows error on first × click (eraser rejects), clears chip on second × click (eraser resolves)', async () => {
    const eraser = vi.fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValue(undefined);

    const { contentEl } = mountUpdateMode({ spell: SPELL_WITH_HOTKEY, eraser });

    const clearBtn = contentEl.querySelector('.grimoire-hotkey-clear') as HTMLButtonElement;
    clearBtn.click();

    // Wait for error message to appear
    await vi.waitFor(() => {
      expect(contentEl.textContent).toContain('Could not clear hotkey.');
    });

    // Chip still shows "g"
    const chip = contentEl.querySelector('.grimoire-hotkey-chip') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('g');

    // Second click — eraser resolves successfully
    const clearBtn2 = contentEl.querySelector('.grimoire-hotkey-clear') as HTMLButtonElement;
    clearBtn2.click();

    await vi.waitFor(() => {
      expect(contentEl.querySelector('.grimoire-hotkey-chip')).toBeNull();
    });
  });
});
