/**
 * Regression guard for the "Failed to resolve module specifier 'child_process'" runtime
 * error in Obsidian's renderer.
 *
 * esbuild emits a CJS bundle and marks `child_process` external. A *static* import is
 * lowered to `require("child_process")` (which Electron resolves), but a *dynamic*
 * `await import("child_process")` is preserved verbatim as a bare ESM specifier — which
 * Obsidian's browser-style module loader cannot resolve at runtime.
 *
 * This test builds the production bundle and asserts the child_process access compiles to
 * the `require(...)` form, never a dynamic `import(...)`. A unit test cannot catch this:
 * Node/vitest resolves both forms fine — the failure only manifests in the bundled output.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../../');
const bundlePath = path.join(projectRoot, 'main.js');

describe('spawnCast bundle module resolution', () => {
  let bundle: string;

  beforeAll(() => {
    // Build the production bundle directly via esbuild (skip the tsc gate, which has
    // pre-existing unrelated type errors). This mirrors `node esbuild.config.mjs production`.
    execFileSync('node', ['esbuild.config.mjs', 'production'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    bundle = readFileSync(bundlePath, 'utf-8');
  });

  it('accesses child_process via require(), never a dynamic import()', () => {
    expect(bundle).not.toMatch(/import\(\s*["']child_process["']\s*\)/);
    expect(bundle).toMatch(/require\(\s*["']child_process["']\s*\)/);
  });
});
