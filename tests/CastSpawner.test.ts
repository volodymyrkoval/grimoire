import { describe, it, expect, vi, afterEach } from 'vitest';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('echo output — #deriveEchoConfig via public seam', () => {
    it('debugs each stdout chunk prefixed with [castId] when echoOutput is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: true,
      });

      fakeProcess.emitStdout('hello');
      fakeProcess.emit('exit', 0);
      await resultPromise;

      expect(consoleSpy).toHaveBeenCalledWith('[abc] hello');
    });
  });

  describe('#attachStdoutListener — echo branch', () => {
    it('does not call console.debug when echoOutput is false', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: false,
      });

      fakeProcess.emitStdout('hello');
      fakeProcess.emit('exit', 0);
      await resultPromise;

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('calls console.debug with prefixed chunk exactly once when echoOutput is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: true,
      });

      fakeProcess.emitStdout('hello');
      fakeProcess.emit('exit', 0);
      await resultPromise;

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('[abc] hello');
    });
  });

  describe('#attachStderrListener — echo branch + double-duty', () => {
    it('accumulates stderr but does not live-echo when echoOutput is false (on-failure console.error still fires)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: false,
      });

      fakeProcess.emitStderr('error text');
      fakeProcess.emit('exit', 1);
      const result = await resultPromise;

      // stderr accumulated correctly into the tail
      expect(result.stderrTail).toBe('error text');
      // no live-echo call (no prefixed message)
      expect(consoleSpy).not.toHaveBeenCalledWith('[abc] error text');
      // on-failure call still fired
      expect(consoleSpy).toHaveBeenCalledWith('Forge spawn stderr:\nerror text');
    });

    it('accumulates stderr AND live-echoes to console.error when echoOutput is true', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: true,
      });

      fakeProcess.emitStderr('oops');
      fakeProcess.emit('exit', 0);
      const result = await resultPromise;

      // stderr accumulated correctly
      expect(result.stderrTail).toBe('oops');
      // live-echo fired with prefixed chunk
      expect(consoleSpy).toHaveBeenCalledWith('[abc] oops');
    });

    it('fires both live-echo console.error and on-failure console.error on non-zero exit with echoOutput true', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: true,
      });

      fakeProcess.emitStderr('oops');
      fakeProcess.emit('exit', 1);
      await resultPromise;

      // live-echo fired
      expect(consoleSpy).toHaveBeenCalledWith('[abc] oops');
      // on-failure dump also fired
      expect(consoleSpy).toHaveBeenCalledWith('Forge spawn stderr:\noops');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('E5 — echo edge cases', () => {
    it('(a) uses [cast] prefix when env.CAST_ID is missing and echoOutput is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: {},
        echoOutput: true,
      });

      fakeProcess.emitStdout('hello');
      fakeProcess.emit('exit', 0);
      await resultPromise;

      expect(consoleSpy).toHaveBeenCalledWith('[cast] hello');
    });

    it('(b) emits single console.debug call for a multi-line chunk (one prefix per chunk, not per line)', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: true,
      });

      fakeProcess.emitStdout('line1\nline2\n');
      fakeProcess.emit('exit', 0);
      await resultPromise;

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('[abc] line1\nline2\n');
    });

    it('(c) calls console.debug with just the prefix when chunk is an empty string', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: true,
      });

      fakeProcess.emitStdout('');
      fakeProcess.emit('exit', 0);
      await resultPromise;

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('[abc] ');
    });

    it('(d) resolves success path unchanged and no on-failure console.error when echoOutput true and exit code 0', async () => {
      const debugSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: true,
      });

      fakeProcess.emitStdout('output');
      fakeProcess.emit('exit', 0);
      const result = await resultPromise;

      // success path unchanged
      expect(result.code).toBe(0);
      expect(result.stderrTail).toBe('');
      expect(result.error).toBeUndefined();
      // live echo happened
      expect(debugSpy).toHaveBeenCalledWith('[abc] output');
      // no on-failure console.error
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

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

  describe('F1 — echo OFF preserves today', () => {
    it('(a) echoOutput false + stdout chunk emitted before exit → console.debug receives zero calls', async () => {
      const debugSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: false,
      });

      fakeProcess.emitStdout('some output');
      fakeProcess.emit('exit', 0);
      await resultPromise;

      expect(debugSpy).toHaveBeenCalledTimes(0);
    });

    it('(b) echoOutput false + stderr chunk "error text" + exit code 1 → resolved stderrTail === "error text"', async () => {
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: false,
      });

      fakeProcess.emitStderr('error text');
      fakeProcess.emit('exit', 1);
      const result = await resultPromise;

      expect(result.stderrTail).toBe('error text');
    });

    it('(c) echoOutput false + stderr chunk + exit code 1 → on-failure console.error called exactly once with string starting with "Forge spawn stderr:\\n"', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fakeProcess = makeFakeProcess();
      const fakeSpawn: SpawnFn = vi.fn(() => fakeProcess);

      const spawner = new CastSpawner({ spawner: fakeSpawn });
      const resultPromise = spawner.run({
        binary: 'claude',
        args: [],
        env: { CAST_ID: 'abc' },
        echoOutput: false,
      });

      fakeProcess.emitStderr('error text');
      fakeProcess.emit('exit', 1);
      await resultPromise;

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Forge spawn stderr:\n/)
      );
    });
  });
});
