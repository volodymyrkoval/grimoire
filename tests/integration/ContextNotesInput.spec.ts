/**
 * Integration test: ContextNotesInput — keyboard selection tests.
 *
 * Tests the keyboard behavior:
 * - Enter on a focused dropdown button selects that item
 * - Enter in search input selects the first dropdown item
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { ContextNotesInput } from '../../src/ui/widgets/ContextNotesInput';

describe('ContextNotesInput keyboard selection', () => {
  let app: App;
  let container: HTMLElement;
  let input: ContextNotesInput;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = new App() as any;
    container = document.createElement('div');
    onChange = vi.fn();
    input = new ContextNotesInput();

    // Mock vault.getMarkdownFiles to return test files
    (app.vault.getMarkdownFiles as any).mockReturnValue([
      new TFile('Notes', 'notes/notes.md'),
      new TFile('Meeting', 'meeting.md'),
      new TFile('Todo', 'todo.md'),
    ]);

    input.mount(container, { app, onChange });
  });

  // ------------------------------------------------------------------ A1
  it('Enter on a focused dropdown button selects that item', () => {
    const searchInput = container.querySelector<HTMLInputElement>('input.context-notes-search')!;
    expect(searchInput).not.toBeNull();

    // Type to trigger dropdown
    searchInput.value = 'Notes';
    searchInput.dispatchEvent(new Event('input'));

    const firstBtn = container.querySelector<HTMLButtonElement>('div.context-notes-dropdown button');
    expect(firstBtn).not.toBeNull();
    expect(firstBtn!.textContent).toContain('Notes');

    // Focus the button and press Enter
    firstBtn!.focus();
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    firstBtn!.dispatchEvent(enterEvent);

    // Item should be added (onChange called)
    expect(onChange).toHaveBeenCalledWith(['notes/notes.md']);

    // Search input should be cleared
    expect(searchInput.value).toBe('');

    // Dropdown should be empty
    const dropdownBtn = container.querySelector<HTMLButtonElement>('div.context-notes-dropdown button');
    expect(dropdownBtn).toBeNull();
  });

  // ------------------------------------------------------------------ A2
  it('Enter in the search input selects the first dropdown item', () => {
    const searchInput = container.querySelector<HTMLInputElement>('input.context-notes-search')!;
    expect(searchInput).not.toBeNull();

    // Type to trigger dropdown
    searchInput.value = 'Notes';
    searchInput.dispatchEvent(new Event('input'));

    const firstBtn = container.querySelector<HTMLButtonElement>('div.context-notes-dropdown button');
    expect(firstBtn).not.toBeNull();

    // Focus the search input and press Enter
    searchInput.focus();
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    searchInput.dispatchEvent(enterEvent);

    // First item should be added
    expect(onChange).toHaveBeenCalledWith(['notes/notes.md']);

    // Search input should be cleared
    expect(searchInput.value).toBe('');

    // Dropdown should be empty
    const dropdownBtn = container.querySelector<HTMLButtonElement>('div.context-notes-dropdown button');
    expect(dropdownBtn).toBeNull();
  });

  // ------------------------------------------------------------------ A3
  it('Enter in search input with empty dropdown does nothing', () => {
    const searchInput = container.querySelector<HTMLInputElement>('input.context-notes-search')!;

    // No dropdown items (no query)
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));

    // Press Enter
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    searchInput.dispatchEvent(enterEvent);

    // onChange should NOT have been called
    expect(onChange).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ A4
  it('Button Enter event is prevented (does not submit form)', () => {
    const searchInput = container.querySelector<HTMLInputElement>('input.context-notes-search')!;

    searchInput.value = 'Notes';
    searchInput.dispatchEvent(new Event('input'));

    const firstBtn = container.querySelector<HTMLButtonElement>('div.context-notes-dropdown button')!;
    firstBtn.focus();

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault');
    firstBtn.dispatchEvent(enterEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ A5
  it('Search input Enter event is prevented', () => {
    const searchInput = container.querySelector<HTMLInputElement>('input.context-notes-search')!;

    searchInput.value = 'Notes';
    searchInput.dispatchEvent(new Event('input'));

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault');
    searchInput.dispatchEvent(enterEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
