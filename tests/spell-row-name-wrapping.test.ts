import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { SpellRow } from '../src/ui/components/SpellRow';
import { makeMockEl } from './helpers/mockEl';

function extractRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match rule boundary or rule start, the selector, optional whitespace, then opening brace
  const re = new RegExp(`(?:^|\\})\\s*${escaped}[^{]*\\{([^}]*)\\}`, 'm');
  const m = re.exec(css);
  return m ? m[1] : '';
}

const css = readFileSync('src/main.css', 'utf-8');

describe('spell-row-name-wrapping: CSS structural assertions', () => {
  it('.spells-row-hint contains white-space: nowrap', () => {
    const body = extractRuleBody(css, '.spells-row-hint');
    expect(body).toContain('white-space: nowrap');
  });

  it('.spells-row-hint contains flex-shrink: 0', () => {
    const body = extractRuleBody(css, '.spells-row-hint');
    expect(body).toContain('flex-shrink: 0');
  });

  it('.spells-row, .sentinel-row retains align-items: center', () => {
    const body = extractRuleBody(css, '.spells-row,');
    expect(body).toContain('align-items: center');
  });

  it('.spells-row-name rule contains display: flex', () => {
    const body = extractRuleBody(css, '.spells-row-name');
    expect(body).toContain('display: flex');
  });

  it('.spells-row-name rule contains min-width: 0', () => {
    const body = extractRuleBody(css, '.spells-row-name');
    expect(body).toContain('min-width: 0');
  });

  it('.spells-row-name rule contains overflow-wrap: break-word', () => {
    const body = extractRuleBody(css, '.spells-row-name');
    expect(body).toContain('overflow-wrap: break-word');
  });

  it('rowHint chip text is exactly the frozen vocabulary', () => {
    const rowHintSrc = readFileSync('src/ui/components/rowHint.ts', 'utf-8');
    expect(rowHintSrc).toContain('↵ cast · → options');
  });
});

describe('spell-row-name-wrapping: edge-case DOM presence', () => {
  it('short name (1 char) still renders a name span', () => {
    const container = makeMockEl();
    const row = new SpellRow();
    row.render(container, { name: 'x', path: 'x.md' }, false, false);
    // name-block wrapper is first createDiv on row.el
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    const nameCalls = nameBlock?.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.text === 'x'
    ) ?? [];
    expect(nameCalls.length).toBe(1);
  });

  it('very long name (200 chars, no spaces) renders both name span and hint chip', () => {
    const longName = 'A'.repeat(200);
    const container = makeMockEl();
    const row = new SpellRow();
    row.render(container, { name: longName, path: 'x.md' }, false, false);
    // name-block wrapper is first createDiv on row.el
    const nameBlock = row.el.createDiv.mock.results[0]?.value;
    const nameCalls = nameBlock?.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.text === longName
    ) ?? [];
    expect(nameCalls.length).toBe(1);
    // hint chip is still on row.el
    const hintCalls = row.el.createSpan.mock.calls.filter(
      (call: any[]) => call[0]?.cls === 'spells-row-hint'
    ) ?? [];
    expect(hintCalls.length).toBe(1);
  });
});
