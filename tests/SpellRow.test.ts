import { describe, it, expect } from 'vitest';
import { SpellRow } from '../src/ui/components/SpellRow';
import { makeMockEl } from './helpers/mockEl';

describe('SpellRow', () => {
  it('with spell.hotkey !== null appends a .spell-hotkey-badge span as direct child of .spells-row and sets has-hotkey class', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md', executeOnNote: true, hotkey: 'f' as any };

    const row = new SpellRow();
    row.render(container, spell, false, true);

    // Badge is now a direct child of row.el (not inside nameBlock)
    expect(row.el.createSpan).toHaveBeenCalledWith({ cls: 'spell-hotkey-badge', text: 'f' });
    // Row must carry the has-hotkey CSS class
    expect(row.el.addClass).toHaveBeenCalledWith('has-hotkey');
    // Override-dot is still inside the nameBlock
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    expect(nameBlock.createSpan).toHaveBeenCalledWith({ cls: 'grimoire-override-dot' });
    // Badge must NOT be inside nameBlock
    const badgeInName = nameBlock.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spell-hotkey-badge'
    );
    expect(badgeInName).toHaveLength(0);
  });

  it('with spell.hotkey === null does not append a .spell-hotkey-badge span', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md', executeOnNote: true, hotkey: null };

    const row = new SpellRow();
    row.render(container, spell, false, false);

    // Get the .spells-row-name wrapper
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    const badgeCalls = nameBlock?.createSpan.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'spell-hotkey-badge'
    ) ?? [];
    expect(badgeCalls).toHaveLength(0);
  });

  it('with hasOverride: true appends a .grimoire-override-dot span', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md', executeOnNote: true, hotkey: null };

    const row = new SpellRow();
    row.render(container, spell, false, true);

    // Get the .spells-row-name wrapper (first createDiv call on row.el)
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    // Check nameBlock.createSpan for override-dot
    expect(nameBlock.createSpan).toHaveBeenCalledWith({ cls: 'grimoire-override-dot' });
  });

  it('with hasOverride: false does not append .grimoire-override-dot', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md', executeOnNote: true, hotkey: null };

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
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md', executeOnNote: true, hotkey: null };

    const row = new SpellRow();
    row.render(container, spell, false);

    // Get the .spells-row-name wrapper
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    const dotCalls = nameBlock?.createSpan.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    ) ?? [];
    expect(dotCalls).toHaveLength(0);
  });

  it('renders the keyboard hint spans with correct structure', () => {
    const container = makeMockEl();
    const spell = { name: 'Fire Bolt', path: '/spells/fire.md', executeOnNote: true, hotkey: null };

    const row = new SpellRow();
    row.render(container, spell, false);

    // The wrapper span is the only direct createSpan on row.el (carries spells-row-hint)
    const wrapperCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    );
    expect(wrapperCalls).toHaveLength(1);

    // Children (cast + options chip) live inside the wrapper, not on row.el directly
    const wrapper = row.el.createSpan.mock.results.find(
      (r: any) => r.type === 'return'
    )?.value;

    const castCalls = wrapper?.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint-cast'
    ) ?? [];
    expect(castCalls).toHaveLength(1);
    expect(castCalls[0][0]).toEqual({ cls: 'spells-row-hint-cast', text: '↵ cast · ' });

    const optionsCalls = wrapper?.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-options-chip'
    ) ?? [];
    expect(optionsCalls).toHaveLength(1);
  });
});
