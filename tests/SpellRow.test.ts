import { describe, it, expect, vi } from 'vitest';
import { SpellRow } from '../src/ui/components/SpellRow';

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

describe('SpellRow', () => {
  it('with hasOverride: true appends a .grimoire-override-dot span', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md' };

    const row = new SpellRow(container, spell, false, true);

    // Check that the row's el has the override dot call
    expect(row.el.createSpan).toHaveBeenCalledWith({ cls: 'grimoire-override-dot' });
  });

  it('with hasOverride: false does not append .grimoire-override-dot', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md' };

    const row = new SpellRow(container, spell, false, false);

    const dotCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    );
    expect(dotCalls).toHaveLength(0);
  });

  it('with hasOverride omitted (undefined) does not append .grimoire-override-dot', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md' };

    const row = new SpellRow(container, spell, false);

    const dotCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    );
    expect(dotCalls).toHaveLength(0);
  });
});
