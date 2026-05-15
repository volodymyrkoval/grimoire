import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { CastRunInput, CastRunCallbacks } from '../../../src/cast/local/CastRunner';
import type { CastInput, CastCallbacks } from '../../../src/cast/Caster';
import { LocalCaster } from '../../../src/cast/local/LocalCaster';
import { DEFAULT_SETTINGS } from '../../../src/domain/settings/Settings';

const makeRunnerStub = () => {
  let capturedCallbacks: CastRunCallbacks | undefined;
  const run = vi.fn((input: CastRunInput, cbs: CastRunCallbacks) => {
    capturedCallbacks = cbs;
  });
  return { run, getCallbacks: () => capturedCallbacks! };
};

const baseInput: CastInput = {
  castId: 'cast-1',
  spellPath: 'spells/foo.md',
  modelId: 'claude-sonnet-4-5',
  effort: 'medium',
  userPrompt: 'Execute this spell',
  vaultMountPath: '/vault',
};

const settings = {
  ...DEFAULT_SETTINGS,
  binaryPath: '/usr/local/bin/claude',
  cliCommand: 'claude',
  vaultMountPath: '/vault',
};

describe('LocalCaster', () => {
  let runner: ReturnType<typeof makeRunnerStub>;
  let callbacks: CastCallbacks;

  beforeEach(() => {
    runner = makeRunnerStub();
    callbacks = {
      onAccepted: vi.fn(),
      onFailure: vi.fn(),
    };
  });

  describe('file-mode (systemPromptFile present)', () => {
    it('invokes runner with systemPromptFile and userPrompt args', () => {
      const caster = new LocalCaster({ runner, settings });
      const input: CastInput = { ...baseInput, systemPromptFile: 'spells/foo.md' };

      caster.cast(input, callbacks);

      expect(runner.run).toHaveBeenCalledOnce();
      const [runInput] = runner.run.mock.calls[0];
      expect(runInput).toMatchObject({
        systemPromptFile: 'spells/foo.md',
        userPrompt: 'Execute this spell',
      });
      expect(runInput).not.toHaveProperty('metaSpell');
    });
  });

  describe('inline-mode (systemPromptFile absent)', () => {
    it('invokes runner with metaSpell set to userPrompt', () => {
      const caster = new LocalCaster({ runner, settings });

      caster.cast(baseInput, callbacks);

      expect(runner.run).toHaveBeenCalledOnce();
      const [runInput] = runner.run.mock.calls[0];
      expect(runInput).toMatchObject({
        metaSpell: 'Execute this spell',
      });
      expect(runInput).not.toHaveProperty('systemPromptFile');
      expect(runInput).not.toHaveProperty('userPrompt');
    });
  });

  describe('claudeHooksDirAbs threading', () => {
    it('passes claudeHooksDirAbs as claudeHooksDir in run input', () => {
      const caster = new LocalCaster({
        runner,
        settings,
        claudeHooksDirAbs: '/vault/.obsidian/plugins/grimoire/agent-hooks',
      });
      caster.cast(baseInput, callbacks);

      const [runInput] = runner.run.mock.calls[0];
      expect(runInput.claudeHooksDir).toBe('/vault/.obsidian/plugins/grimoire/agent-hooks');
    });

    it('claudeHooksDir is undefined in run input when claudeHooksDirAbs is not provided', () => {
      const caster = new LocalCaster({ runner, settings });
      caster.cast(baseInput, callbacks);

      const [runInput] = runner.run.mock.calls[0];
      expect(runInput.claudeHooksDir).toBeUndefined();
    });
  });

  describe('callback translation', () => {
    it('runner onSuccess triggers callbacks.onAccepted({}) exactly once', () => {
      const caster = new LocalCaster({ runner, settings });
      caster.cast(baseInput, callbacks);

      runner.getCallbacks().onSuccess();

      expect(callbacks.onAccepted).toHaveBeenCalledOnce();
      expect(callbacks.onAccepted).toHaveBeenCalledWith({});
    });

    it('runner onFailure(msg) triggers callbacks.onFailure(msg) exactly once with same message', () => {
      const caster = new LocalCaster({ runner, settings });
      caster.cast(baseInput, callbacks);

      runner.getCallbacks().onFailure('spawn error: ENOENT');

      expect(callbacks.onFailure).toHaveBeenCalledOnce();
      expect(callbacks.onFailure).toHaveBeenCalledWith('spawn error: ENOENT');
    });
  });
});
