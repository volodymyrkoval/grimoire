import { describe, it, expect, vi } from 'vitest';
import { SearchPhase } from '../src/ui/popup/SearchPhase';
import type { PopupPhaseContext } from '../src/ui/popup/PopupPhase';
import type { NavigablePanel } from '../src/ui/tabs/TabPanel';

describe('SearchPhase', () => {
  function createFakePanel(): NavigablePanel {
    return {
      id: 'test-panel',
      filter: vi.fn(() => 0),
      reset: vi.fn(),
      move: vi.fn((delta, current) => current + delta),
      updateSelection: vi.fn(),
      confirm: vi.fn(),
      mount: vi.fn(),
      length: 5,
    };
  }

  function createFakeSpellsPanel(): NavigablePanel & { openOptions: (index: number) => void } {
    return {
      id: 'spells',
      filter: vi.fn(() => 0),
      reset: vi.fn(),
      move: vi.fn((delta, current) => current + delta),
      updateSelection: vi.fn(),
      confirm: vi.fn(),
      mount: vi.fn(),
      length: 5,
      openOptions: vi.fn(),
    };
  }

  function createFakeContext(activePanel: NavigablePanel, spellsPanel: NavigablePanel & { openOptions: (index: number) => void }): PopupPhaseContext {
    return {
      activePanel: vi.fn(() => activePanel),
      selectedIndex: vi.fn(() => 2),
      setSelectedIndex: vi.fn(),
      setActivePanel: vi.fn(),
      spellsPanel: vi.fn(() => spellsPanel),
      panels: vi.fn(() => [activePanel, spellsPanel]),
      kb: vi.fn(() => ({ suspend: vi.fn(), resume: vi.fn() } as any)),
      contentEl: vi.fn(() => document.createElement('div')),
      exitDetail: vi.fn(),
      renderSearch: vi.fn(),
    };
  }

  it('handleArrow(1) moves the active panel forward and returns true', () => {
    const panel = createFakePanel();
    const spellsPanel = createFakeSpellsPanel();
    const ctx = createFakeContext(panel, spellsPanel);
    const phase = new SearchPhase(ctx);

    const result = phase.handleArrow(1);

    expect(result).toBe(true);
    expect(panel.move).toHaveBeenCalledWith(1, 2);
  });

  it('handleArrow(-1) moves the active panel backward and returns true', () => {
    const panel = createFakePanel();
    const spellsPanel = createFakeSpellsPanel();
    const ctx = createFakeContext(panel, spellsPanel);
    const phase = new SearchPhase(ctx);

    const result = phase.handleArrow(-1);

    expect(result).toBe(true);
    expect(panel.move).toHaveBeenCalledWith(-1, 2);
  });

  it('handleEnter calls activePanel.confirm and returns true', () => {
    const panel = createFakePanel();
    const spellsPanel = createFakeSpellsPanel();
    const ctx = createFakeContext(panel, spellsPanel);
    const phase = new SearchPhase(ctx);

    const result = phase.handleEnter();

    expect(result).toBe(true);
    expect(panel.confirm).toHaveBeenCalledWith(2);
  });

  it('handleTab advances to the next panel round-robin and returns true', () => {
    const panel1 = createFakePanel();
    const panel2 = createFakeSpellsPanel();
    const ctx = createFakeContext(panel1, panel2);
    const phase = new SearchPhase(ctx);

    const result = phase.handleTab();

    expect(result).toBe(true);
    // handleTab sets the next panel as active and triggers a full re-render
    expect(ctx.setActivePanel).toHaveBeenCalledWith(panel2);
    expect(ctx.renderSearch).toHaveBeenCalled();
  });

  it('handleArrowRight calls openOptions on spells panel when active panel is spells and has a selected spell', () => {
    const spellsPanel = createFakeSpellsPanel();
    spellsPanel.length = 3; // has spells
    const otherPanel = createFakePanel();
    const ctx = createFakeContext(spellsPanel, spellsPanel);
    const phase = new SearchPhase(ctx);

    const result = phase.handleArrowRight();

    expect(result).toBe(true);
    expect(spellsPanel.openOptions).toHaveBeenCalledWith(2);
  });

  it('handleArrowRight returns false when active panel is not spells panel', () => {
    const panel = createFakePanel();
    const spellsPanel = createFakeSpellsPanel();
    const ctx = createFakeContext(panel, spellsPanel);
    const phase = new SearchPhase(ctx);

    const result = phase.handleArrowRight();

    expect(result).toBe(false);
    expect(spellsPanel.openOptions).not.toHaveBeenCalled();
  });

  it('handleArrowRight returns false when spells panel has no rows', () => {
    const spellsPanel = createFakeSpellsPanel();
    spellsPanel.length = 0;
    const ctx = createFakeContext(spellsPanel, spellsPanel);
    const phase = new SearchPhase(ctx);

    const result = phase.handleArrowRight();

    expect(result).toBe(false);
    expect(spellsPanel.openOptions).not.toHaveBeenCalled();
  });

  it('interceptClose returns false', () => {
    const panel = createFakePanel();
    const spellsPanel = createFakeSpellsPanel();
    const ctx = createFakeContext(panel, spellsPanel);
    const phase = new SearchPhase(ctx);

    const result = phase.interceptClose();

    expect(result).toBe(false);
  });

  it('kind equals "search"', () => {
    const panel = createFakePanel();
    const spellsPanel = createFakeSpellsPanel();
    const ctx = createFakeContext(panel, spellsPanel);
    const phase = new SearchPhase(ctx);

    expect(phase.kind).toBe('search');
  });
});
