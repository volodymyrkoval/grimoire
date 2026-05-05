import { describe, it, expect, vi } from 'vitest';
import { SpellsPanel } from '../src/ui/tabs/SpellsPanel';

function makeMockEl(): any {
  const el: any = {
    empty: vi.fn(),
    addClass: vi.fn(),
    removeClass: vi.fn(),
    scrollIntoView: vi.fn(),
    onClickEvent: vi.fn(),
    style: {},
    offsetHeight: 0,
  };
  el.createEl = vi.fn(() => makeMockEl());
  el.createDiv = vi.fn(() => makeMockEl());
  el.createSpan = vi.fn(() => makeMockEl());
  return el;
}

describe('SpellsPanel.filter', () => {
  function makePanel(): SpellsPanel {
    const panel = new SpellsPanel();
    panel.mount(makeMockEl());
    return panel;
  }

  it('empty query returns all 10 spells plus both sentinels', () => {
    const panel = makePanel();
    panel.filter('');
    expect(panel.length).toBe(12);
  });

  it('substring-matching query "protect" returns Protection Rune plus sentinels', () => {
    const panel = makePanel();
    panel.filter('protect');
    expect(panel.length).toBe(3);
  });

  it('fuzzy query "hlin" matches Healing Incantation but not via substring', () => {
    const panel = makePanel();
    panel.filter('hlin');
    expect(panel.length).toBe(3);
  });

  it('query with no spell match returns only sentinels', () => {
    const panel = makePanel();
    panel.filter('forge');
    expect(panel.length).toBe(2);
  });

  it('returns 0 as focus index when spells are found', () => {
    const panel = makePanel();
    const index = panel.filter('protect');
    expect(index).toBe(0);
  });

  it('focuses Forge sentinel at index 0 when only sentinels remain', () => {
    const panel = makePanel();
    const index = panel.filter('forge');
    expect(index).toBe(0);
  });
});
