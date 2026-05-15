import { describe, it, expect, vi } from 'vitest';
import { CastSpawner, SpawnFn, SpawnedProcess } from '../src/cast/local/spawnCast';

function makeFakeProcess() {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {};
  const stdoutHandlers: ((chunk: any) => void)[] = [];
  const stderrHandlers: ((chunk: any) => void)[] = [];

  const proc: any = {
    stdout: { on: (_: string, h: any) => stdoutHandlers.push(h) },
    stderr: { on: (_: string, h: any) => stderrHandlers.push(h) },
    on: (event: string, h: any) => {
      (handlers[event] ??= []).push(h);
    },
    emit(event: string, ...args: any[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
    emitStdout(chunk: any) {
      stdoutHandlers.forEach((h) => h(chunk));
    },
    emitStderr(chunk: any) {
      stderrHandlers.forEach((h) => h(chunk));
    },
  };

  return proc as SpawnedProcess & { emit: Function; emitStdout: Function; emitStderr: Function };
}

describe('CastSpawner', () => {
  it('resolves with code 0 when exit event fires with code 0', async () => {
    const fakeProcess = makeFakeProcess();
    const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

    const spawner = new CastSpawner({ spawner: fakeSpawn });
    const resultPromise = spawner.run({
      binary: 'claude',
      args: ['--help'],
      env: {},
    });

    fakeProcess.emit('exit', 0);

    const result = await resultPromise;
    expect(result.code).toBe(0);
    expect(result.stderrTail).toBe('');
  });

  it('resolves with code 1 and stderrTail when exit fires with non-zero code', async () => {
    const fakeProcess = makeFakeProcess();
    const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

    const spawner = new CastSpawner({ spawner: fakeSpawn });
    const resultPromise = spawner.run({
      binary: 'claude',
      args: [],
      env: {},
    });

    fakeProcess.emitStderr('error text');
    fakeProcess.emit('exit', 1);

    const result = await resultPromise;
    expect(result.code).toBe(1);
    expect(result.stderrTail).toBe('error text');
  });

  it('resolves with code null and error when async error event fires', async () => {
    const fakeProcess = makeFakeProcess();
    const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

    const spawner = new CastSpawner({ spawner: fakeSpawn });
    const resultPromise = spawner.run({
      binary: 'claude',
      args: [],
      env: {},
    });

    const err = new Error('spawn ENOENT');
    fakeProcess.emit('error', err);

    const result = await resultPromise;
    expect(result.code).toBeNull();
    expect(result.error).toBe(err);
    expect(result.stderrTail).toBe('');
  });

  it('rejects the promise when spawner throws synchronously', async () => {
    const error = new Error('invalid args');
    const fakeSpawn: SpawnFn = vi.fn(() => {
      throw error;
    });

    const spawner = new CastSpawner({ spawner: fakeSpawn });

    await expect(spawner.run({
      binary: 'claude',
      args: [],
      env: {},
    })).rejects.toBe(error);
  });

  it('resolves only once when both exit and error fire', async () => {
    const fakeProcess = makeFakeProcess();
    const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

    const spawner = new CastSpawner({ spawner: fakeSpawn });
    const resultPromise = spawner.run({
      binary: 'claude',
      args: [],
      env: {},
    });

    fakeProcess.emit('exit', 0);
    fakeProcess.emit('error', new Error('oops'));

    const result = await resultPromise;
    expect(result.code).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('truncates stderr to last 500 characters', async () => {
    const fakeProcess = makeFakeProcess();
    const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

    const spawner = new CastSpawner({ spawner: fakeSpawn });
    const resultPromise = spawner.run({
      binary: 'claude',
      args: [],
      env: {},
    });

    const longError = 'x'.repeat(700);
    fakeProcess.emitStderr(longError);
    fakeProcess.emit('exit', 1);

    const result = await resultPromise;
    expect(result.stderrTail.length).toBe(500);
    expect(result.stderrTail).toBe('x'.repeat(500));
  });

  it('drains stdout without crashing', async () => {
    const fakeProcess = makeFakeProcess();
    const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

    const spawner = new CastSpawner({ spawner: fakeSpawn });
    const resultPromise = spawner.run({
      binary: 'claude',
      args: [],
      env: {},
    });

    fakeProcess.emitStdout('some output');
    fakeProcess.emit('exit', 0);

    const result = await resultPromise;
    expect(result.code).toBe(0);
  });
});
