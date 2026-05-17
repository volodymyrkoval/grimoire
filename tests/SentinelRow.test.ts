import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SentinelRow } from '../src/ui/components/SentinelRow';
import { makeMockEl } from './helpers/mockEl';

describe('SentinelRow', () => {
  it('with showHint: true appends hint spans with correct structure', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'refine' as const, name: 'Refine' };

    const row = new SentinelRow();
    row.render(container, sentinel, false, true);

    // The wrapper span carries spells-row-hint on row.el (after sentinel-name span)
    const wrapperCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    );
    expect(wrapperCalls).toHaveLength(1);

    // Cast hint and options chip live inside the wrapper, not directly on row.el
    const wrapperEl = row.el.createSpan.mock.results.find(
      (r: any) => r.value?.createSpan.mock.calls.length > 0
    )?.value;
    const castCalls = wrapperEl?.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint-cast'
    ) ?? [];
    expect(castCalls).toHaveLength(1);
  });

  it('with showHint: false appends zero .spells-row-hint children', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'forge' as const, name: 'Forge' };

    const row = new SentinelRow();
    row.render(container, sentinel, false, false);

    const hintCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    );
    expect(hintCalls).toHaveLength(0);
  });

  it('with showHint omitted (undefined) appends zero .spells-row-hint children', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'forge' as const, name: 'Forge' };

    const row = new SentinelRow();
    row.render(container, sentinel, false);

    const hintCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    );
    expect(hintCalls).toHaveLength(0);
  });

  it('with showHint: true renders both cast and options hint spans', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'refine' as const, name: 'Refine' };

    const row = new SentinelRow();
    row.render(container, sentinel, false, true);

    // Wrapper carries spells-row-hint; cast + options are nested inside it
    const wrapperEl = row.el.createSpan.mock.results.find(
      (r: any) => r.value?.createSpan.mock.calls.length > 0
    )?.value;

    const castCalls = wrapperEl?.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint-cast'
    ) ?? [];
    expect(castCalls).toHaveLength(1);
    expect(castCalls[0][0]?.text).toEqual('↵ cast · ');

    const optionsCalls = wrapperEl?.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'grimoire-options-chip'
    ) ?? [];
    expect(optionsCalls).toHaveLength(1);
  });

  it('when selected, sentinel-row hint visibility is defined in CSS', () => {
    const cssPath = resolve(__dirname, '../src/main.css');
    const cssContent = readFileSync(cssPath, 'utf-8');

    // Assert the CSS rule exists for sentinel-row.is-selected .spells-row-hint
    expect(cssContent).toContain('.sentinel-row.is-selected .spells-row-hint');
  });

  it('.sentinel-row has flex layout to push hint chip to the right edge', () => {
    const cssPath = resolve(__dirname, '../src/main.css');
    const cssContent = readFileSync(cssPath, 'utf-8');

    // Extract the .sentinel-row rule block (lines 35-39)
    const sentinelRowMatch = cssContent.match(/\.sentinel-row\s*\{([^}]+)\}/);
    expect(sentinelRowMatch).toBeTruthy();

    const sentinelRowRule = sentinelRowMatch![1];
    expect(sentinelRowRule).toContain('display: flex');
    expect(sentinelRowRule).toContain('justify-content: space-between');
  });

  it('with showHint: true and onOptionsClick callback, passes callback to appendRowHint', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'refine' as const, name: 'Refine' };
    const onOptionsClick = vi.fn();

    const row = new SentinelRow();
    row.render(container, sentinel, false, true, onOptionsClick);

    // row.el.createSpan calls: [0] sentinel-name, [1] spells-row-hint wrapper
    const createSpanCalls = row.el.createSpan.mock.calls;
    expect(createSpanCalls.length).toBeGreaterThanOrEqual(2);

    // The wrapper is the second call (index 1)
    const wrapperCall = createSpanCalls[1];
    expect(wrapperCall[0]?.cls).toBe('spells-row-hint');

    // Options chip is the second child of the wrapper (index 1 on wrapper.createSpan)
    const wrapperEl = row.el.createSpan.mock.results[1]?.value;
    expect(wrapperEl).toBeDefined();
    const optionsChipCall = wrapperEl.createSpan.mock.calls[1];
    expect(optionsChipCall[0]?.cls).toBe('grimoire-options-chip');

    const optionsChipEl = wrapperEl.createSpan.mock.results[1]?.value;
    expect(optionsChipEl).toBeDefined();

    // Find and invoke the click handler to verify callback is wired
    const clickEventCalls = optionsChipEl.addEventListener.mock.calls.filter(
      (call: any[]) => call[0] === 'click'
    );
    expect(clickEventCalls).toHaveLength(1);

    const clickHandler = clickEventCalls[0][1] as (e: Event) => void;
    const mockEvent = { stopPropagation: vi.fn() };
    clickHandler(mockEvent as any);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(onOptionsClick).toHaveBeenCalled();
  });

  it('with kind: "separator", no .sentinel-description element is appended', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'separator' as const, name: '─' };

    const row = new SentinelRow();
    row.render(container, sentinel, false, false);

    const createDivCalls = row.el.createDiv.mock.calls;
    const descriptionCalls = createDivCalls.filter((call: any[]) => call[0]?.cls === 'sentinel-description');
    expect(descriptionCalls).toHaveLength(0);
  });
});
