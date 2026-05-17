import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  renderSessionStartScript,
  renderPostToolUseScript,
  renderStopScript,
} from '../../src/castLog/hookScripts';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function mkTempDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'grimoire-hooks-'));
}

async function materializeScript(dir: string, name: string, content: string): Promise<string> {
  const scriptPath = path.join(dir, name);
  await fs.promises.writeFile(scriptPath, content, { encoding: 'utf-8' });
  await fs.promises.chmod(scriptPath, 0o755);
  return scriptPath;
}

function runShell(
  scriptPath: string,
  opts?: { stdin?: string; env?: Record<string, string> },
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('sh', [scriptPath], {
    input: opts?.stdin,
    encoding: 'utf-8',
    env: { ...process.env, ...opts?.env },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function readLog(logPath: string): unknown[] {
  const raw = fs.readFileSync(logPath, 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkTempDir();
});

afterEach(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

// ── D1: Helpers smoke test ────────────────────────────────────────────────────

describe('helpers', () => {
  it('runShell executes a simple echo script and captures stdout', async () => {
    const script = '#!/bin/sh\necho hello-from-shell\n';
    const scriptPath = await materializeScript(tempDir, 'echo.sh', script);
    const { status, stdout } = runShell(scriptPath);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('hello-from-shell');
  });

  it('runShell passes env variables to the script', async () => {
    const script = '#!/bin/sh\necho "VALUE=$MY_VAR"\n';
    const scriptPath = await materializeScript(tempDir, 'env.sh', script);
    const { status, stdout } = runShell(scriptPath, { env: { MY_VAR: 'test123' } });
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('VALUE=test123');
  });

  it('runShell passes stdin to the script', async () => {
    const script = '#!/bin/sh\ncat\n';
    const scriptPath = await materializeScript(tempDir, 'cat.sh', script);
    const { status, stdout } = runShell(scriptPath, { stdin: 'hello stdin\n' });
    expect(status).toBe(0);
    expect(stdout).toBe('hello stdin\n');
  });
});

// ── D2: SessionStart writes in-progress ──────────────────────────────────────

describe('session-start.sh', () => {
  it('writes one in-progress line to the log when CAST_ID is set', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const content = renderSessionStartScript({ logPathAbs: logPath });
    const scriptPath = await materializeScript(tempDir, 'session-start.sh', content);

    const { status } = runShell(scriptPath, { env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const lines = readLog(logPath);
    expect(lines).toHaveLength(1);
    const entry = lines[0] as { stage: string; ts: string; castId: string };
    expect(entry.stage).toBe('in-progress');
    expect(entry.ts).toMatch(ISO_TS_RE);
    expect(entry.castId).toBe('abc');
  });

  // ── D3: No CAST_ID → no-op ──────────────────────────────────────────────────

  it('exits 0 and creates no log file when CAST_ID is absent', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const content = renderSessionStartScript({ logPathAbs: logPath });
    const scriptPath = await materializeScript(tempDir, 'session-start.sh', content);

    // Run without CAST_ID in the env override
    const envWithoutCastId = Object.fromEntries(
      Object.entries({ ...process.env }).filter(([k]) => k !== 'CAST_ID'),
    ) as Record<string, string>;
    const result = spawnSync('sh', [scriptPath], { encoding: 'utf-8', env: envWithoutCastId });

    expect(result.status).toBe(0);
    expect(fs.existsSync(logPath)).toBe(false);
  });
});

// ── D4: PostToolUse appends to scratch ───────────────────────────────────────

describe('post-tool-use.sh', () => {
  it('appends the file_path to the scratch file when CAST_ID is set', async () => {
    const scratchDir = path.join(tempDir, 'scratch');
    const content = renderPostToolUseScript({ scratchDirAbs: scratchDir });
    const scriptPath = await materializeScript(tempDir, 'post-tool-use.sh', content);
    const stdin = '{"tool_name":"Write","tool_input":{"file_path":"foo/bar.md"},"tool_response":{}}';

    const { status } = runShell(scriptPath, { stdin, env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    expect(fs.existsSync(path.join(tempDir, 'cast-log.jsonl'))).toBe(false);

    const scratchFile = path.join(scratchDir, 'abc.paths');
    expect(fs.existsSync(scratchFile)).toBe(true);
    expect(fs.readFileSync(scratchFile, 'utf-8')).toBe('foo/bar.md\n');
  });

  // ── D7: edge — file_path with apostrophes and unicode ──────────────────────

  it('handles file_path containing apostrophes and unicode without corruption', async () => {
    const scratchDir = path.join(tempDir, 'scratch');
    const content = renderPostToolUseScript({ scratchDirAbs: scratchDir });
    const scriptPath = await materializeScript(tempDir, 'post-tool-use.sh', content);

    // Build valid JSON with the tricky path
    const trickyPath = "docs/it's a test/日本.md";
    const stdin = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: trickyPath },
      tool_response: {},
    });

    const { status } = runShell(scriptPath, { stdin, env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const scratchFile = path.join(scratchDir, 'abc.paths');
    expect(fs.readFileSync(scratchFile, 'utf-8')).toBe(`${trickyPath}\n`);
  });

  // ── D8: edge — tool_input with no file_path key ────────────────────────────

  it('exits 0 and creates no scratch file when tool_input has no file_path key', async () => {
    const scratchDir = path.join(tempDir, 'scratch');
    const content = renderPostToolUseScript({ scratchDirAbs: scratchDir });
    const scriptPath = await materializeScript(tempDir, 'post-tool-use.sh', content);
    const stdin = '{"tool_name":"Edit","tool_input":{},"tool_response":{}}';

    const { status } = runShell(scriptPath, { stdin, env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const scratchFile = path.join(scratchDir, 'abc.paths');
    const scratchContent = fs.existsSync(scratchFile)
      ? fs.readFileSync(scratchFile, 'utf-8')
      : '';
    expect(scratchContent.trim()).toBe('');
  });
});

// ── D5: Stop drains scratch with dedup ───────────────────────────────────────

describe('stop.sh', () => {
  it('writes a done line with sorted deduped affectedFiles and removes the scratch file', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    await fs.promises.mkdir(scratchDir, { recursive: true });

    // Pre-populate scratch with duplicates
    const scratchFile = path.join(scratchDir, 'abc.paths');
    await fs.promises.writeFile(scratchFile, 'a.md\nb.md\na.md\n', 'utf-8');

    const content = renderStopScript({ logPathAbs: logPath, scratchDirAbs: scratchDir });
    const scriptPath = await materializeScript(tempDir, 'stop.sh', content);

    const { status } = runShell(scriptPath, { env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const lines = readLog(logPath);
    expect(lines).toHaveLength(1);
    const entry = lines[0] as { stage: string; ts: string; castId: string; affectedFiles: string[] };
    expect(entry.stage).toBe('done');
    expect(entry.ts).toMatch(ISO_TS_RE);
    expect(entry.castId).toBe('abc');
    expect(entry.affectedFiles).toEqual(['a.md', 'b.md']);

    // Scratch file should be gone
    expect(fs.existsSync(scratchFile)).toBe(false);
  });

  // ── D6: Stop with no prior tool calls ──────────────────────────────────────

  it('writes a done line with empty affectedFiles when no scratch file exists', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    // Do NOT create the scratch dir or file

    const content = renderStopScript({ logPathAbs: logPath, scratchDirAbs: scratchDir });
    const scriptPath = await materializeScript(tempDir, 'stop.sh', content);

    const { status } = runShell(scriptPath, { env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const lines = readLog(logPath);
    expect(lines).toHaveLength(1);
    const entry = lines[0] as { stage: string; affectedFiles: string[] };
    expect(entry.stage).toBe('done');
    expect(entry.affectedFiles).toEqual([]);
  });

  // ── D10: vaultRootAbs prefix stripping ───────────────────────────────────────

  it('strips vault root prefix from affected files when vaultRootAbs is provided', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    await fs.promises.mkdir(scratchDir, { recursive: true });

    // Pre-populate scratch with paths that have the vault root prefix
    const scratchFile = path.join(scratchDir, 'abc.paths');
    await fs.promises.writeFile(
      scratchFile,
      '/vault/docs/a.md\n/vault/src/b.ts\na-relative.md\n',
      'utf-8',
    );

    const content = renderStopScript({
      logPathAbs: logPath,
      scratchDirAbs: scratchDir,
      vaultRootAbs: '/vault',
    });
    const scriptPath = await materializeScript(tempDir, 'stop.sh', content);

    const { status } = runShell(scriptPath, { env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const lines = readLog(logPath);
    expect(lines).toHaveLength(1);
    const entry = lines[0] as { stage: string; affectedFiles: string[] };
    expect(entry.stage).toBe('done');
    // Paths with vault root prefix stripped; path without prefix passes through unchanged
    // sort -u orders by path with slashes, then prefixes are stripped (order preserved from sort)
    expect(entry.affectedFiles).toEqual(['docs/a.md', 'src/b.ts', 'a-relative.md']);
  });

  it('preserves paths without vault prefix when vaultRootAbs is provided', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    await fs.promises.mkdir(scratchDir, { recursive: true });

    const scratchFile = path.join(scratchDir, 'abc.paths');
    await fs.promises.writeFile(scratchFile, 'relative/path.md\nother.txt\n', 'utf-8');

    const content = renderStopScript({
      logPathAbs: logPath,
      scratchDirAbs: scratchDir,
      vaultRootAbs: '/vault',
    });
    const scriptPath = await materializeScript(tempDir, 'stop.sh', content);

    const { status } = runShell(scriptPath, { env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const lines = readLog(logPath);
    const entry = lines[0] as { affectedFiles: string[] };
    expect(entry.affectedFiles).toEqual(['other.txt', 'relative/path.md']);
  });

  it('backward compat: empty vaultRootAbs produces byte-identical script to pre-change baseline', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    await fs.promises.mkdir(scratchDir, { recursive: true });

    const scratchFile = path.join(scratchDir, 'abc.paths');
    await fs.promises.writeFile(scratchFile, 'file1.md\nfile2.ts\n', 'utf-8');

    // Call with explicit empty string
    const contentWithEmpty = renderStopScript({
      logPathAbs: logPath,
      scratchDirAbs: scratchDir,
      vaultRootAbs: '',
    });

    // Call without the optional param (simulating old caller)
    const contentWithoutParam = renderStopScript({
      logPathAbs: logPath,
      scratchDirAbs: scratchDir,
    });

    // Scripts should be byte-identical
    expect(contentWithEmpty).toBe(contentWithoutParam);

    // Both should execute identically
    const scriptPath1 = await materializeScript(tempDir, 'stop1.sh', contentWithEmpty);
    const scriptPath2 = await materializeScript(tempDir, 'stop2.sh', contentWithoutParam);

    const result1 = runShell(scriptPath1, { env: { CAST_ID: 'cast1' } });
    const result2 = runShell(scriptPath2, { env: { CAST_ID: 'cast2' } });

    expect(result1.status).toBe(0);
    expect(result2.status).toBe(0);
  });

  // ── D9: edge — two concurrent castIds ──────────────────────────────────────

  it('keeps each castId scratch isolated when two casts run concurrently', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    await fs.promises.mkdir(scratchDir, { recursive: true });

    const postContent = renderPostToolUseScript({ scratchDirAbs: scratchDir });
    const postScript = await materializeScript(tempDir, 'post-tool-use.sh', postContent);

    const stopContent = renderStopScript({ logPathAbs: logPath, scratchDirAbs: scratchDir });
    const stopScript = await materializeScript(tempDir, 'stop.sh', stopContent);

    runShell(postScript, {
      stdin: '{"tool_name":"Write","tool_input":{"file_path":"foo.md"},"tool_response":{}}',
      env: { CAST_ID: 'castA' },
    });

    runShell(postScript, {
      stdin: '{"tool_name":"Write","tool_input":{"file_path":"bar.md"},"tool_response":{}}',
      env: { CAST_ID: 'castB' },
    });

    runShell(stopScript, { env: { CAST_ID: 'castA' } });
    runShell(stopScript, { env: { CAST_ID: 'castB' } });

    const lines = readLog(logPath) as Array<{
      stage: string;
      castId: string;
      affectedFiles: string[];
    }>;
    expect(lines).toHaveLength(2);

    const castADone = lines.find((l) => l.castId === 'castA');
    const castBDone = lines.find((l) => l.castId === 'castB');

    expect(castADone?.affectedFiles).toEqual(['foo.md']);
    expect(castBDone?.affectedFiles).toEqual(['bar.md']);

    // Both scratch files cleaned up
    expect(fs.existsSync(path.join(scratchDir, 'castA.paths'))).toBe(false);
    expect(fs.existsSync(path.join(scratchDir, 'castB.paths'))).toBe(false);
  });

  // ── B5b: glob metacharacter in vault root ───────────────────────────────────

  it('strips prefix when vaultRootAbs contains glob metacharacters like [', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    await fs.promises.mkdir(scratchDir, { recursive: true });

    const vaultRoot = '/Users/alice/Vault [2024]';
    const scratchFile = path.join(scratchDir, 'abc.paths');
    await fs.promises.writeFile(
      scratchFile,
      `${vaultRoot}/notes/foo.md\n${vaultRoot}/src/bar.ts\n`,
      'utf-8',
    );

    const content = renderStopScript({
      logPathAbs: logPath,
      scratchDirAbs: scratchDir,
      vaultRootAbs: vaultRoot,
    });
    const scriptPath = await materializeScript(tempDir, 'stop.sh', content);

    const { status } = runShell(scriptPath, { env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const lines = readLog(logPath);
    const entry = lines[0] as { affectedFiles: string[] };
    // Unquoted ${line#$VAULT_ROOT/} would silently fail on paths containing [ ] * ?
    expect(entry.affectedFiles).toEqual(['notes/foo.md', 'src/bar.ts']);
  });

  // ── B5: degenerate case — path equals vault root exactly ────────────────────

  it('preserves path that equals vault root exactly (no trailing slash)', async () => {
    const logPath = path.join(tempDir, 'cast-log.jsonl');
    const scratchDir = path.join(tempDir, 'scratch');
    await fs.promises.mkdir(scratchDir, { recursive: true });

    // Pre-populate scratch with a path that equals the vault root exactly
    const scratchFile = path.join(scratchDir, 'abc.paths');
    await fs.promises.writeFile(scratchFile, '/vault\n', 'utf-8');

    const content = renderStopScript({
      logPathAbs: logPath,
      scratchDirAbs: scratchDir,
      vaultRootAbs: '/vault',
    });
    const scriptPath = await materializeScript(tempDir, 'stop.sh', content);

    const { status } = runShell(scriptPath, { env: { CAST_ID: 'abc' } });
    expect(status).toBe(0);

    const lines = readLog(logPath);
    expect(lines).toHaveLength(1);
    const entry = lines[0] as { stage: string; affectedFiles: string[] };
    expect(entry.stage).toBe('done');
    // Path does not have trailing slash, so ${line#"$VAULT_ROOT/"} does not match
    // and /vault passes through unchanged
    expect(entry.affectedFiles).toEqual(['/vault']);
  });
});
