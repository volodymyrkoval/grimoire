import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SentinelRow } from '../src/ui/components/SentinelRow';

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

describe('SentinelRow', () => {
  it('with showHint: true appends exactly one .spells-row-hint child', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'refine' as const, name: 'Refine' };

    const row = new SentinelRow();
    row.render(container, sentinel, false, true);

    const hintCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    );
    expect(hintCalls).toHaveLength(1);
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

  it('with showHint: true renders hint with correct text', () => {
    const container = makeMockEl();
    const sentinel = { kind: 'refine' as const, name: 'Refine' };

    const row = new SentinelRow();
    row.render(container, sentinel, false, true);

    const hintCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    );
    expect(hintCalls[0][0]).toEqual({
      cls: 'spells-row-hint',
      text: '↵ cast · → options',
    });
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
});
