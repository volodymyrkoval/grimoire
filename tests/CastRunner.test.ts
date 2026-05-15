import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastRunner, CastRunCallbacks } from '../src/cast/local/CastRunner';
import { SpawnFn, SpawnedProcess } from '../src/cast/local/spawnCast';

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

function makeRunnerWithFakeSpawn() {
  let capturedCommand = '';
  let capturedArgs: string[] = [];
  let capturedOptions: any;
  const fakeProcess = makeFakeProcess();

  const fakeSpawn: SpawnFn = vi.fn((cmd: string, args: readonly string[], opts: any) => {
    capturedCommand = cmd;
    capturedArgs = Array.from(args);
    capturedOptions = opts;
    return fakeProcess;
  });

  const runner = new CastRunner(fakeSpawn);

  return {
    runner,
    fakeProcess,
    fakeSpawn,
    getCommand: () => capturedCommand,
    getArgs: () => capturedArgs,
    getOptions: () => capturedOptions,
  };
}

describe('CastRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('calls onSuccess when cast exits with code 0', async () => {
    const { runner, fakeProcess } = makeRunnerWithFakeSpawn();
    const callbacks: CastRunCallbacks = {
      onSuccess: vi.fn(),
      onFailure: vi.fn(),
    };

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/vault',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      callbacks
    );

    fakeProcess.emit('exit', 0);
    await vi.runAllTimersAsync();

    expect(callbacks.onSuccess).toHaveBeenCalledOnce();
    expect(callbacks.onFailure).not.toHaveBeenCalled();
  });

  it('calls onFailure with stderrTail when exit code is non-zero', async () => {
    const { runner, fakeProcess } = makeRunnerWithFakeSpawn();
    const callbacks: CastRunCallbacks = {
      onSuccess: vi.fn(),
      onFailure: vi.fn(),
    };

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/vault',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      callbacks
    );

    fakeProcess.emitStderr('error message');
    fakeProcess.emit('exit', 1);
    await vi.runAllTimersAsync();

    expect(callbacks.onFailure).toHaveBeenCalledWith('error message');
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
  });

  it('calls onFailure with error message when spawn error fires', async () => {
    const { runner, fakeProcess } = makeRunnerWithFakeSpawn();
    const callbacks: CastRunCallbacks = {
      onSuccess: vi.fn(),
      onFailure: vi.fn(),
    };

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/vault',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      callbacks
    );

    const err = new Error('spawn ENOENT');
    fakeProcess.emit('error', err);
    await vi.runAllTimersAsync();

    expect(callbacks.onFailure).toHaveBeenCalledWith('spawn ENOENT');
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
  });

  it('uses binaryPath when it is non-empty', () => {
    const { runner, getCommand } = makeRunnerWithFakeSpawn();

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/vault',
        binaryPath: '/opt/bin/claude',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      { onSuccess: () => {}, onFailure: () => {} }
    );

    expect(getCommand()).toBe('/opt/bin/claude');
  });

  it('uses cliCommand when binaryPath is empty', () => {
    const { runner, getCommand } = makeRunnerWithFakeSpawn();

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/vault',
        binaryPath: '',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      { onSuccess: () => {}, onFailure: () => {} }
    );

    expect(getCommand()).toBe('claude');
  });

  it('passes VAULT_MOUNT_PATH in env to spawner', () => {
    const { runner, getOptions } = makeRunnerWithFakeSpawn();

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/my/vault',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      { onSuccess: () => {}, onFailure: () => {} }
    );

    expect(getOptions().env.VAULT_MOUNT_PATH).toBe('/my/vault');
  });

  it('passes CAST_ID in env to spawner', () => {
    const { runner, getOptions } = makeRunnerWithFakeSpawn();

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/my/vault',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        castId: 'abc123',
      },
      { onSuccess: () => {}, onFailure: () => {} }
    );

    expect(getOptions().env.CAST_ID).toBe('abc123');
  });

  it('passes vaultMountPath as cwd to spawner', () => {
    const { runner, getOptions } = makeRunnerWithFakeSpawn();

    runner.run(
      {
        metaSpell: 'my spell',
        modelId: 'claude-sonnet-4-5',
        effort: null,
        vaultMountPath: '/my/vault',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      { onSuccess: () => {}, onFailure: () => {} }
    );

    expect(getOptions().cwd).toBe('/my/vault');
  });

  it('passes constructed args to spawner', () => {
    const { runner, getArgs } = makeRunnerWithFakeSpawn();

    runner.run(
      {
        metaSpell: 'my spell content',
        modelId: 'claude-sonnet-4-5',
        effort: 'high',
        vaultMountPath: '/vault',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        castId: 'test-cast-id',
      },
      { onSuccess: () => {}, onFailure: () => {} }
    );

    const args = getArgs();
    expect(args).toContain('-p');
    expect(args).toContain('my spell content');
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4-5');
    expect(args).toContain('--effort');
    expect(args).toContain('high');
  });

});
