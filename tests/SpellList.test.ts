import { describe, it, expect, vi } from 'vitest';
import { SpellList } from '../src/ui/components/SpellList';
import type { Spell } from '../src/domain/spells/Spell';
import { spellPath } from '../src/domain/spells/SpellPath';

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

function makeMockEmitter(): any {
  return {
    emit: vi.fn(),
  };
}

describe('SpellList.render', () => {
  it('with hasOverride predicate matching first spell appends override-dot only to first row', () => {
    const container = makeMockEl();
    const emitter = makeMockEmitter();
    const list = new SpellList(container, emitter);
    const firstPath = spellPath('/spells/fire.md');
    const spells: Spell[] = [
      { name: 'Fire Bolt', path: firstPath },
      { name: 'Water Jet', path: spellPath('/spells/water.md') },
    ];

    list.render(spells, 0, (path) => path === firstPath);

    // Get the spellList's el (which is the container div created in constructor)
    // It should have been empty() then spellRows added to it
    // Each spellRow is a SpellRow instance with el property
    // We need to check the list.el's children (via the mocked createDiv)
    const listEl = list.el;
    const createDivCalls = listEl.createDiv.mock.calls;
    // The first createDiv call creates the row for first spell with hasOverride=true
    // The second createDiv call creates the row for second spell with hasOverride=false
    expect(createDivCalls.length).toBeGreaterThanOrEqual(2);
    // Check that first row call included override dot creation
    const firstRowEl = listEl.createDiv.mock.results[0]?.value;
    const firstRowDotCalls = firstRowEl?.createSpan.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    ) ?? [];
    expect(firstRowDotCalls.length).toBe(1);

    // Check that second row call did NOT include override dot creation
    const secondRowEl = listEl.createDiv.mock.results[1]?.value;
    const secondRowDotCalls = secondRowEl?.createSpan.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    ) ?? [];
    expect(secondRowDotCalls.length).toBe(0);
  });

  it('with hasOverride predicate omitted renders no override-dots', () => {
    const container = makeMockEl();
    const emitter = makeMockEmitter();
    const list = new SpellList(container, emitter);
    const spells: Spell[] = [
      { name: 'Fire Bolt', path: spellPath('/spells/fire.md') },
      { name: 'Water Jet', path: spellPath('/spells/water.md') },
    ];

    list.render(spells, 0);

    // Default predicate should be () => false, so no override-dots
    const listEl = list.el;
    const divCalls = listEl.createDiv.mock.results;
    let overrideDotCount = 0;
    divCalls.forEach((result: any) => {
      const rowEl = result.value;
      if (rowEl) {
        const dotCalls = rowEl.createSpan.mock.calls.filter(
          (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
        );
        overrideDotCount += dotCalls.length;
      }
    });
    expect(overrideDotCount).toBe(0);
  });

  it('with hasOverride predicate matching no spells renders no override-dots', () => {
    const container = makeMockEl();
    const emitter = makeMockEmitter();
    const list = new SpellList(container, emitter);
    const spells: Spell[] = [
      { name: 'Fire Bolt', path: spellPath('/spells/fire.md') },
      { name: 'Water Jet', path: spellPath('/spells/water.md') },
    ];

    list.render(spells, 0, () => false);

    const listEl = list.el;
    const divCalls = listEl.createDiv.mock.results;
    let overrideDotCount = 0;
    divCalls.forEach((result: any) => {
      const rowEl = result.value;
      if (rowEl) {
        const dotCalls = rowEl.createSpan.mock.calls.filter(
          (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
        );
        overrideDotCount += dotCalls.length;
      }
    });
    expect(overrideDotCount).toBe(0);
  });
});
