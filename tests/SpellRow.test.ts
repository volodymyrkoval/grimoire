import { describe, it, expect } from 'vitest';
import { SpellRow } from '../src/ui/components/SpellRow';
import { makeMockEl } from './helpers/mockEl';

describe('SpellRow', () => {
  it('with hasOverride: true appends a .grimoire-override-dot span', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md' };

    const row = new SpellRow();
    row.render(container, spell, false, true);

    // Get the .spells-row-name wrapper (first createDiv call on row.el)
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    // Check nameBlock.createSpan for override-dot
    expect(nameBlock.createSpan).toHaveBeenCalledWith({ cls: 'grimoire-override-dot' });
  });

  it('with hasOverride: false does not append .grimoire-override-dot', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md' };

    const row = new SpellRow();
    row.render(container, spell, false, false);

    // Get the .spells-row-name wrapper
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    const dotCalls = nameBlock?.createSpan.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    ) ?? [];
    expect(dotCalls).toHaveLength(0);
  });

  it('with hasOverride omitted (undefined) does not append .grimoire-override-dot', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md' };

    const row = new SpellRow();
    row.render(container, spell, false);

    // Get the .spells-row-name wrapper
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    const dotCalls = nameBlock?.createSpan.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    ) ?? [];
    expect(dotCalls).toHaveLength(0);
  });

  it('renders the keyboard hint span with the correct text', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md' };

    const row = new SpellRow();
    row.render(container, spell, false);

    const hintCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    );
    expect(hintCalls).toHaveLength(1);
    expect(hintCalls[0][0]).toEqual({
      cls: 'spells-row-hint',
      text: '↵ cast · → options',
    });
  });
});
