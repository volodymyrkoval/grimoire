/**
 * E1 (Section E): Verify no straggler buildMetaSpell references remain in src/ or tests/.
 * This is a regression guard ensuring the old inline meta-spell builder was fully removed
 * during the forge-spell-materialization refactor.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('E1: buildMetaSpell cleanup assertion', () => {
  it('grep returns no buildMetaSpell references in src/ or tests/', () => {
    const projectRoot = path.resolve(__dirname, '../../');
    const srcDir = path.join(projectRoot, 'src');
    const testsDir = path.join(projectRoot, 'tests');

    let output = '';
    try {
      // Exclude e2e directory and node_modules to avoid self-references and dependencies
      output = execSync(
        `grep -r "buildMetaSpell" "${srcDir}" "${testsDir}" --exclude-dir=e2e --exclude-dir=node_modules 2>&1`,
        { encoding: 'utf-8' }
      ).trim();
    } catch (e: any) {
      // grep exits with code 1 when no matches found — that's the success case
      if (e.status === 1) {
        output = '';
      } else {
        // Some other error occurred
        throw e;
      }
    }

    expect(output, 'buildMetaSpell references should not exist in src/ or tests/ (excluding e2e)').toBe('');
  });
});
