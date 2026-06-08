import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Guard test: ensures no console.* calls exist outside the allowlist.
 *
 * This test verifies that the migration from console.* to the Logger class is
 * complete. The only two allowed console calls are in spawnCast.ts for echoing
 * subprocess output to the developer console when echoOutput is enabled.
 *
 * Allowed lines:
 * - spawnCast.ts:168 — console.log(echoConfig.prefix + chunk.toString())
 * - spawnCast.ts:187 — console.error(echoConfig.prefix + text)
 *
 * Both are gated by echoConfig.echoOn and used for forwarding subprocess echo
 * output (not diagnostic logging).
 */
describe('guard: no-stray-console', () => {
  it('should have exactly two console.* calls, both in spawnCast.ts echo listeners', () => {
    const srcDir = join(__dirname, '..', 'src');
    const consoleMatches: Array<{ file: string; line: number; content: string }> = [];

    // Recursively walk src/ and find all .ts files
    const walkDir = (dir: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.endsWith('.ts')) {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            const match = line.match(/console\.(log|error|warn|debug|info)\s*\(/);
            if (match) {
              consoleMatches.push({
                file: fullPath,
                line: idx + 1,
                content: line.trim(),
              });
            }
          });
        }
      }
    };

    walkDir(srcDir);

    // spawnCast.ts pipes subprocess stdout/stderr through echoConfig.prefix — these are
    // intentional pass-through writes to the terminal, not diagnostic logging.
    const allowlist = consoleMatches.filter(
      (m) => m.file.includes('spawnCast.ts') && m.content.includes('echoConfig.prefix'),
    );

    // Violations are matches that are NOT in the allowlist
    const violations = consoleMatches.filter(
      (m) => !allowlist.some((a) => a.file === m.file && a.line === m.line)
    );

    if (violations.length > 0) {
      const violationDetails = violations
        .map((v) => `${v.file}:${v.line} — ${v.content}`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} console.* call(s) outside the allowlist:\n${violationDetails}`
      );
    }

    // Also verify we have EXACTLY the two allowed calls
    expect(allowlist).toHaveLength(2);
    expect(consoleMatches).toHaveLength(2);
  });
});
