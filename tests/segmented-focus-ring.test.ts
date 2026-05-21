import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

describe('segmented control focus-visible rule', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');

  it('has a focus-visible rule with the right outline', () => {
    expect(css).toMatch(/\.grimoire-segmented__btn:focus-visible\s*\{[^}]*outline:\s*[12]px\s+solid\s+var\(--interactive-accent\)[^}]*\}/s);
  });

  it('has a non-zero outline-offset', () => {
    expect(css).toMatch(/\.grimoire-segmented__btn:focus-visible\s*\{[^}]*outline-offset:\s*[1-9]\d*px[^}]*\}/s);
  });

  it('does not use plain :focus without -visible', () => {
    expect(css).not.toMatch(/\.grimoire-segmented__btn:focus(?!-visible)/);
  });
});
