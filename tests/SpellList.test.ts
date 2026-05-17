import { describe, it, expect, vi } from 'vitest';
import { SpellList } from '../src/ui/components/SpellList';
import type { Spell, Sentinel } from '../src/domain/spells/Spell';
import { spellPath } from '../src/domain/spells/SpellPath';
import { makeMockEl } from './helpers/mockEl';

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
    // The first row's .spells-row-name wrapper is its first createDiv call
    const firstRowEl = listEl.createDiv.mock.results[0]?.value;
    const firstRowNameWrapper = firstRowEl?.createDiv.mock.results[0]?.value;
    const firstRowDotCalls = firstRowNameWrapper?.createSpan.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
    ) ?? [];
    expect(firstRowDotCalls.length).toBe(1);

    // Check that second row call did NOT include override dot creation
    const secondRowEl = listEl.createDiv.mock.results[1]?.value;
    const secondRowNameWrapper = secondRowEl?.createDiv.mock.results[0]?.value;
    const secondRowDotCalls = secondRowNameWrapper?.createSpan.mock.calls?.filter(
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
        const wrapper = rowEl.createDiv?.mock?.results?.[0]?.value;
        const dotCalls = wrapper?.createSpan?.mock?.calls?.filter(
          (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
        ) ?? [];
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
        const wrapper = rowEl.createDiv?.mock?.results?.[0]?.value;
        const dotCalls = wrapper?.createSpan?.mock?.calls?.filter(
          (call: any[]) => call[0]?.cls === 'grimoire-override-dot'
        ) ?? [];
        overrideDotCount += dotCalls.length;
      }
    });
    expect(overrideDotCount).toBe(0);
  });

  it('renders hint in Refine sentinel only, not Forge', () => {
    const container = makeMockEl();
    const emitter = makeMockEmitter();
    const sentinels: Sentinel[] = [
      { kind: 'forge', name: 'Forge' },
      { kind: 'refine', name: 'Refine' },
    ];
    const list = new SpellList(container, emitter, sentinels);
    const spells: Spell[] = [
      { name: 'Fire Bolt', path: spellPath('/spells/fire.md') },
    ];

    list.render(spells, 0);

    const listEl = list.el;
    const divResults = listEl.createDiv.mock.results;

    // The divResults: [0] spell row, [1] sentinels-section container
    // The sentinel rows are created on the sentinels-section container
    expect(divResults.length).toBeGreaterThanOrEqual(2);

    // Get the sentinels-section container (should be at index 1)
    const sentinelsSectionEl = divResults[1]?.value;
    expect(sentinelsSectionEl).toBeDefined();

    // The sentinel rows are created as children of sentinels-section
    const sentinelDivResults = sentinelsSectionEl?.createDiv?.mock.results ?? [];
    expect(sentinelDivResults.length).toBe(2);

    // Get the Forge and Refine rows
    const forgeRowEl = sentinelDivResults[0]?.value;
    const refineRowEl = sentinelDivResults[1]?.value;

    // Forge should not have hint
    const forgeHintCalls = forgeRowEl?.createSpan?.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    ) ?? [];
    expect(forgeHintCalls.length).toBe(0);

    // Refine should have exactly one hint
    const refineHintCalls = refineRowEl?.createSpan?.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    ) ?? [];
    expect(refineHintCalls.length).toBe(1);
    expect(refineHintCalls[0][0]).toEqual({
      cls: 'spells-row-hint',
      text: '↵ cast · → options',
    });
  });
});
