import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App, Setting } from 'obsidian';
import { hydrate } from '../../src/domain/settings/persistence';
// GrimoireSettingTab does not exist yet — this import is the red trigger
import { GrimoireSettingTab } from '../../src/ui/settings/GrimoireSettingTab';

// ---------------------------------------------------------------------------
// Minimal fake plugin — does NOT import src/main.ts
// ---------------------------------------------------------------------------
function makePlugin() {
  const app = new App();
  return {
    app,
    data: hydrate(undefined, app),
    save: vi.fn(),
  } as any;
}

// ---------------------------------------------------------------------------
// Component-capture helpers
// Spy on Setting prototype BEFORE display() so every addText / addDropdown
// callback is intercepted and the component is captured for assertions.
// ---------------------------------------------------------------------------
function installSettingSpies() {
  const textComps: any[] = [];
  const dropComps: any[] = [];

  vi.spyOn(Setting.prototype, 'addText').mockImplementation(function (cb: (c: any) => void) {
    const comp = {
      inputEl: document.createElement('input') as HTMLInputElement,
      _onChange: null as ((v: string) => void) | null,
      setValue(v: string) {
        this.inputEl.value = v;
        return this;
      },
      setPlaceholder(p: string) {
        this.inputEl.placeholder = p;
        return this;
      },
      onChange(fn: (v: string) => void) {
        this._onChange = fn;
        return this;
      },
      __triggerChange(v: string) {
        this.inputEl.value = v;
        if (this._onChange) this._onChange(v);
      },
    };
    textComps.push(comp);
    cb(comp);
    return this;
  });

  vi.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (cb: (c: any) => void) {
    const comp = {
      selectEl: document.createElement('select') as HTMLSelectElement,
      _onChange: null as ((v: string) => void) | null,
      addOption(id: string, _label: string) {
        const opt = document.createElement('option');
        opt.value = id;
        this.selectEl.appendChild(opt);
        return this;
      },
      setValue(v: string) {
        this.selectEl.value = v;
        return this;
      },
      onChange(fn: (v: string) => void) {
        this._onChange = fn;
        return this;
      },
      __triggerChange(v: string) {
        this.selectEl.value = v;
        if (this._onChange) this._onChange(v);
      },
    };
    dropComps.push(comp);
    cb(comp);
    return this;
  });

  return { textComps, dropComps };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GrimoireSettingTab seam', () => {
  let plugin: ReturnType<typeof makePlugin>;
  let tab: GrimoireSettingTab;
  let textComps: any[];
  let dropComps: any[];

  beforeEach(() => {
    vi.restoreAllMocks();
    plugin = makePlugin();
    const spies = installSettingSpies();
    textComps = spies.textComps;
    dropComps = spies.dropComps;

    tab = new GrimoireSettingTab(plugin.app, plugin);
    tab.display();
  });

  // (i) Seven rows render — each Setting appends settingEl + controlEl → 14 children
  it('renders 7 setting rows (14 child elements in containerEl)', () => {
    expect(tab.containerEl.childElementCount).toBe(14);
  });

  // (ii) Text input write-through — spell-tag (index 0)
  it('typing in the spell-tag input writes through to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    textComps[0].__triggerChange('#spell');

    expect(plugin.data.settings.spellTag).toBe('#spell');
    expect(plugin.save).toHaveBeenCalledTimes(1);
  });

  // (iii) Dropdown → Haiku — model field updated, save called
  it('selecting claude-haiku-4-5 writes defaultModel to plugin.data.settings and calls save', () => {
    plugin.save.mockClear();
    dropComps[0].__triggerChange('claude-haiku-4-5');

    expect(plugin.data.settings.defaultModel).toBe('claude-haiku-4-5');
    expect(plugin.save).toHaveBeenCalled();
  });

  // (iv) Dropdown → Opus — effort row lazy-mounts with 5 buttons
  it('selecting claude-opus-4-5 after haiku renders 5 effort buttons', () => {
    // First go to Haiku (so row is in no-options state if default was Sonnet)
    dropComps[0].__triggerChange('claude-haiku-4-5');
    // Then pick Opus — EffortRow.update Case 3: lazy-mount with 5 options
    dropComps[0].__triggerChange('claude-opus-4-5');

    const btns = tab.containerEl.querySelectorAll('.grimoire-segmented__btn');
    expect(btns.length).toBe(5);
  });

  // (v) Effort button click — write-through + save
  it('clicking an effort button writes defaultEffort and calls save', () => {
    // Ensure we have an effort row visible by selecting Opus first
    dropComps[0].__triggerChange('claude-opus-4-5');
    plugin.save.mockClear();

    const btn = tab.containerEl.querySelector<HTMLButtonElement>('.grimoire-segmented__btn');
    expect(btn).not.toBeNull();
    btn!.click();

    expect(plugin.data.settings.defaultEffort).toBeTruthy();
    expect(plugin.save).toHaveBeenCalled();
  });
});
