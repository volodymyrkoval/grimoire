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

    // Forge should not have hint — no spells-row-hint wrapper
    const forgeHintCalls = forgeRowEl?.createSpan?.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    ) ?? [];
    expect(forgeHintCalls.length).toBe(0);

    // Refine should have the spells-row-hint wrapper
    const refineWrapperCalls = refineRowEl?.createSpan?.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    ) ?? [];
    expect(refineWrapperCalls.length).toBe(1);

    // Cast + options chip are nested inside the wrapper
    const refineWrapperEl = refineRowEl?.createSpan?.mock.results?.find(
      (r: any) => r.value?.createSpan.mock.calls.length > 0
    )?.value;
    const refineCastCalls = refineWrapperEl?.createSpan?.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint-cast'
    ) ?? [];
    expect(refineCastCalls.length).toBe(1);
    expect(refineCastCalls[0][0]?.text).toEqual('↵ cast · ');

    const refineOptionsCalls = refineWrapperEl?.createSpan?.mock.calls?.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-options-chip'
    ) ?? [];
    expect(refineOptionsCalls.length).toBe(1);
  });

  it('when spell row options chip is clicked, emits open-options event with the spell (not cast)', () => {
    const container = makeMockEl();
    const emitter = makeMockEmitter();
    const list = new SpellList(container, emitter);
    const spell = { name: 'Fire Bolt', path: spellPath('/spells/fire.md') };
    const spells: Spell[] = [spell];

    list.render(spells, 0);

    // The options chip click handler is registered via addEventListener
    // Capture the click handler so we can invoke it manually
    const listEl = list.el;
    const spellRowEl = listEl.createDiv.mock.results[0]?.value;
    expect(spellRowEl).toBeDefined();

    // spellRowEl.createSpan[0] is the spells-row-hint wrapper
    // The options chip is wrapper.createSpan[1]
    const wrapperEl = spellRowEl.createSpan.mock.results[0]?.value;
    expect(wrapperEl).toBeDefined();
    const optionsChipEl = wrapperEl.createSpan.mock.results[1]?.value;
    expect(optionsChipEl).toBeDefined();

    // Find the addEventListener call on options chip for 'click' event
    const addEventListenerCalls = optionsChipEl.addEventListener.mock.calls;
    expect(addEventListenerCalls.length).toBeGreaterThan(0);

    // The first (and should be only) addEventListener call is the click handler
    const clickHandler = addEventListenerCalls[0]?.[1] as (e: Event) => void;
    expect(clickHandler).toBeDefined();

    // Simulate a click by calling the handler with a mock event
    const mockEvent = { stopPropagation: vi.fn() };
    clickHandler(mockEvent as any);

    // Verify the emitter was called with open-options and the spell
    expect(emitter.emit).toHaveBeenCalledWith('open-options', spell);
  });

  it('when Refine sentinel row options chip is clicked, emits open-refine-options event (not sentinel)', () => {
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
    const sentinelsSectionEl = listEl.createDiv.mock.results[1]?.value;
    expect(sentinelsSectionEl).toBeDefined();

    // The Refine row is the second sentinel row (index 1)
    const sentinelDivResults = sentinelsSectionEl?.createDiv?.mock.results ?? [];
    expect(sentinelDivResults.length).toBe(2);

    const refineRowEl = sentinelDivResults[1]?.value;
    expect(refineRowEl).toBeDefined();

    // refineRowEl.createSpan: [0] sentinel-name, [1] spells-row-hint wrapper
    // wrapper.createSpan: [0] cast hint, [1] options chip
    const wrapperEl = refineRowEl.createSpan.mock.results[1]?.value;
    expect(wrapperEl).toBeDefined();
    const optionsChipEl = wrapperEl.createSpan.mock.results[1]?.value;
    expect(optionsChipEl).toBeDefined();

    // Find the click handler
    const clickEventCalls = optionsChipEl.addEventListener.mock.calls.filter(
      (call: any[]) => call[0] === 'click'
    );
    expect(clickEventCalls).toHaveLength(1);

    const clickHandler = clickEventCalls[0][1] as (e: Event) => void;
    const mockEvent = { stopPropagation: vi.fn() };
    clickHandler(mockEvent as any);

    // Verify the emitter was called with open-refine-options (not sentinel)
    expect(emitter.emit).toHaveBeenCalledWith('open-refine-options', undefined);
    // Ensure it was NOT called with 'sentinel'
    expect(emitter.emit).not.toHaveBeenCalledWith('sentinel', sentinels[1]);
  });
});
