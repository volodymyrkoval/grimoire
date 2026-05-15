/**
 * Integration test: CastDispatcher.dispatch() — executeOnNote end-to-end vertical.
 *
 * Seam: the boundary between the castAction callback in main.ts (caller) and
 * CastDispatcher (real subject). Caster is injected as a spy to capture
 * the userPrompt without spawning real processes.
 *
 * Case (a): executeOnNote: false + no active file
 *   → caster IS invoked, captured userPrompt does NOT contain
 *     "Execute this spell against the note at"
 *
 * Case (b): executeOnNote: true + no active file
 *   → notify is called with bail message, close is called, caster NOT invoked
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastDispatcher } from '../../src/cast/CastDispatcher';
import type { CastDispatchInput } from '../../src/cast/CastDispatcher';
import type { CastInput, CastCallbacks, Caster } from '../../src/cast/Caster';
import type { CastLogWriter } from '../../src/castLog/CastLogWriter';
import { spellPath } from '../../src/domain/spells/SpellPath';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';

const TEST_SETTINGS: GrimoireSettings = {
  spellTag: 'grimoire/spell',
  cliCommand: 'claude',
  binaryPath: '',
  forgeOutputFolder: 'Spells/',
  vaultMountPath: '/vault',
  defaultModel: 'claude-sonnet-4-5',
  defaultEffort: 'medium',
  executionMode: 'local',
  portalHost: '',
  portalPort: '',
  portalPath: '',
  portalAuthUser: '',
  portalAuthPassword: '',
};

function makeBaseInput(overrides: Partial<CastDispatchInput> = {}): CastDispatchInput {
  return {
    spell: {
      name: 'Test Spell',
      path: spellPath('/spells/test.md'),
      executeOnNote: false,
    },
    model: 'claude-sonnet-4-5',
    effort: 'medium',
    contextNotePaths: [],
    followUp: '',
    settings: TEST_SETTINGS,
    activeFilePath: null,
    executeOnNote: false,
    ...overrides,
  };
}

function makeStubCaster() {
  let capturedInput: CastInput | undefined;
  const castFn = vi.fn((input: CastInput, _cbs: CastCallbacks) => {
    capturedInput = input;
  });
  const instance: Caster = { cast: castFn };
  return {
    thunk: () => instance,
    getInput: () => capturedInput,
    castFn,
  };
}

function makeLogWriter(): CastLogWriter {
  return {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CastDispatcher.dispatch() — executeOnNote vertical', () => {
  let notify: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let casterStub: ReturnType<typeof makeStubCaster>;
  let dispatcher: CastDispatcher;

  beforeEach(() => {
    notify = vi.fn();
    close = vi.fn();
    casterStub = makeStubCaster();
    dispatcher = new CastDispatcher({ notify, close, caster: casterStub.thunk, logWriter: () => makeLogWriter() });
  });

  // ------------------------------------------------------------------ G1
  it('executeOnNote: false + no active file — runner is invoked and userPrompt does not contain the note path prefix', () => {
    const input = makeBaseInput({ executeOnNote: false, activeFilePath: null });

    dispatcher.dispatch(input);

    // Caster must have been called — no early bail for executeOnNote: false
    expect(casterStub.castFn).toHaveBeenCalledOnce();

    // Capture the userPrompt passed to caster.cast()
    const capturedInput = casterStub.getInput()!;
    expect(capturedInput.userPrompt).not.toContain('Execute this spell against the note at');
  });

  // ------------------------------------------------------------------ G2
  it('executeOnNote: true + no active file — notify + close called, runner NOT invoked', () => {
    const input = makeBaseInput({ executeOnNote: true, activeFilePath: null });

    dispatcher.dispatch(input);

    // Bail path: notify called once with the "open a note" message
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith('Open a note to cast against');

    // close is called as part of bail
    expect(close).toHaveBeenCalledOnce();

    // Caster must NOT have been invoked
    expect(casterStub.castFn).not.toHaveBeenCalled();
  });
});
