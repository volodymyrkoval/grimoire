/**
 * PopupHarness — shared fixture for CommandPopup integration tests.
 *
 * Encapsulates the PopupHarness interface and factory function. Reduces boilerplate
 * across test files by providing a unified API for:
 * - Keyboard navigation (pressKey, ArrowUp/ArrowDown/Enter/Tab)
 * - Typed input (type, pressKey)
 * - Tab/row selection (clickTab, clickRow)
 * - Form submission (submitForge, clickBack)
 * - DOM assertions (visibleSpellRows, selectedRow, activeTabId, isInDetail)
 *
 * All DOM queries are encapsulated; tests interact only through the PopupHarness
 * interface, not the raw contentEl.
 */

import { App } from 'obsidian';
import { vi } from 'vitest';
import { CommandPopup } from '../../src/ui/CommandPopup';
import type { ImprintAction, FormDefaults, CastAction } from '../../src/ui/CommandPopup';
import type { Scope } from 'obsidian';
import type { Effort } from '../../src/domain/settings/Settings';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import type { CastLogPanelDeps } from '../../src/ui/tabs/CastLogPanel';

export interface PopupHarness {
  modal: CommandPopup;
  contentEl: HTMLElement;

  pressKey(key: string, modifiers?: string[]): boolean;
  type(text: string): void;
  clickTab(id: string): void;
  clickRow(index: number): void;
  clickBack(): void;
  submitForge(values?: { name?: string; description?: string; model?: string; effort?: Effort | null }): void;

  visibleSpellRows(): HTMLElement[];
  visibleSentinelRows(): HTMLElement[];
  selectedRow(): HTMLElement | null;
  selectedRowName(): string | null;
  activeTabId(): string;
  searchInput(): HTMLInputElement;
  isInDetail(): boolean;
}

function makeFakeCastLogPanelDeps(): Omit<CastLogPanelDeps, 'openLink'> {
  return {
    source: { load: vi.fn().mockResolvedValue([]) },
    refresh: { start: vi.fn(), stop: vi.fn() },
    tick: { start: vi.fn(), stop: vi.fn() },
    now: () => new Date(),
  };
}

export function createPopupHarness(options?: {
  imprintAction?: ImprintAction;
  castAction?: CastAction;
  defaults?: FormDefaults;
  overrides?: SpellOverrideStore;
  sessionMap?: OptionsSessionMap;
}): PopupHarness {
  const app = new App() as any;
  const imprintAction = options?.imprintAction ?? vi.fn();
  const castAction: CastAction = options?.castAction ?? vi.fn();
  const defaults: FormDefaults = options?.defaults ?? { defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' };
  const overrides = options?.overrides ?? new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });
  const sessionMap = options?.sessionMap ?? new OptionsSessionMap();
  const testFiles = [
    { basename: 'Summoning Circle', path: '/spells/summoning.md' },
    { basename: 'Protection Rune', path: '/spells/protection.md' },
    { basename: 'Transmutation', path: '/spells/transmutation.md' },
    { basename: 'Scrying Mirror', path: '/spells/scrying.md' },
    { basename: 'Healing Incantation', path: '/spells/healing.md' },
    { basename: 'Banishment Hex', path: '/spells/banishment.md' },
    { basename: 'Divination Ritual', path: '/spells/divination.md' },
    { basename: 'Enchantment Charm', path: '/spells/enchantment.md' },
    { basename: 'Restoration Spell', path: '/spells/restoration.md' },
    { basename: 'Warding Barrier', path: '/spells/warding.md' },
  ];
  app.vault.getMarkdownFiles.mockReturnValue(testFiles);
  app.metadataCache.getFileCache.mockReturnValue({
    frontmatter: { tags: ['spell'] },
  });
  const modal = new CommandPopup({ app, spellTag: 'spell', imprintAction, castAction, defaults, overrides, sessionMap, castLogPanelDeps: makeFakeCastLogPanelDeps() });
  modal.open();
  const { contentEl } = modal;

  function pressKey(key: string, modifiers: string[] = []): boolean {
    return (modal.scope as unknown as { dispatch(k: string, m: string[]): boolean }).dispatch(
      key,
      modifiers
    );
  }

  function getInput(): HTMLInputElement {
    const input = contentEl.querySelector('input[type="text"]');
    if (!input) throw new Error('Search input not found — not in search phase?');
    return input as HTMLInputElement;
  }

  return {
    modal,
    contentEl,

    pressKey,

    type(text: string): void {
      const input = getInput();
      input.value = text;
      input.dispatchEvent(new Event('input'));
    },

    clickTab(id: string): void {
      // TabBar renders tabs as divs with class "modal-tab", text is capitalized id
      const tabs = Array.from(contentEl.querySelectorAll('.modal-tab'));
      const searchText = id.charAt(0).toUpperCase() + id.slice(1);
      const tab = tabs.find((t) => t.textContent?.trim() === searchText);
      if (!tab) throw new Error(`Tab "${id}" not found (searched for text "${searchText}")`);
      tab.dispatchEvent(new Event('click'));
    },

    clickRow(index: number): void {
      const rows = Array.from(
        contentEl.querySelectorAll('.spells-row, .sentinel-row')
      );
      const row = rows[index];
      if (!row) throw new Error(`Row at index ${index} not found (total: ${rows.length})`);
      row.dispatchEvent(new Event('click'));
    },

    clickBack(): void {
      const buttons = Array.from(contentEl.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent?.includes('← back'));
      if (!btn) throw new Error('Back button not found');
      btn.dispatchEvent(new Event('click'));
    },

    submitForge(values: { name?: string; description?: string; model?: string; effort?: Effort | null } = {}): void {
      const form = contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement | null;
      if (!form) throw new Error('Forge form not found');
      if (values.name !== undefined) {
        const input = form.querySelector('input[type="text"]') as HTMLInputElement;
        input.value = values.name;
      }
      if (values.description !== undefined) {
        const ta = form.querySelector('textarea') as HTMLTextAreaElement;
        ta.value = values.description;
      }
      if (values.model !== undefined) {
        const sel = form.querySelector('select') as HTMLSelectElement;
        sel.value = values.model;
        sel.dispatchEvent(new Event('change'));
      }
      if (values.effort !== undefined && values.effort !== null) {
        const effortBtns = Array.from(form.querySelectorAll('.grimoire-effort-row .grimoire-segmented__btn'));
        const btn = effortBtns.find((b) => b.textContent === values.effort) as HTMLButtonElement | undefined;
        if (btn) btn.click();
      }
      form.dispatchEvent(new Event('submit'));
    },

    visibleSpellRows(): HTMLElement[] {
      return Array.from(contentEl.querySelectorAll('.spells-row')) as HTMLElement[];
    },

    visibleSentinelRows(): HTMLElement[] {
      return Array.from(contentEl.querySelectorAll('.sentinel-row')) as HTMLElement[];
    },

    selectedRow(): HTMLElement | null {
      return contentEl.querySelector('.spells-row.is-selected, .sentinel-row.is-selected');
    },

    selectedRowName(): string | null {
      const row = contentEl.querySelector('.spells-row.is-selected, .sentinel-row.is-selected');
      const nameSpan = row?.querySelector('span:first-child');
      return nameSpan?.textContent ?? null;
    },

    activeTabId(): string {
      const tab = contentEl.querySelector('.modal-tab.is-active');
      if (!tab) throw new Error('No active tab found');
      // Tab text is capitalized, convert back to lowercase
      const text = tab.textContent?.trim() ?? '';
      return text.toLowerCase();
    },

    searchInput(): HTMLInputElement {
      return getInput();
    },

    isInDetail(): boolean {
      return contentEl.querySelector('input[type="text"]') === null;
    },
  };
}
