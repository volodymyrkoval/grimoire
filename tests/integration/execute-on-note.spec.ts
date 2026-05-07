/**
 * Integration test: CastDispatcher.dispatch() — executeOnNote end-to-end vertical.
 *
 * Seam: the boundary between the castAction callback in main.ts (caller) and
 * CastDispatcher (real subject). CastRunner is injected as a spy to capture
 * the userPrompt without spawning real processes.
 *
 * Case (a): executeOnNote: false + no active file
 *   → runner IS invoked, captured userPrompt does NOT contain
 *     "Execute this spell against the note at"
 *
 * Case (b): executeOnNote: true + no active file
 *   → notify is called with bail message, close is called, runner NOT invoked
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastDispatcher } from '../../src/cast/CastDispatcher';
import type { CastDispatchInput } from '../../src/cast/CastDispatcher';
import { CastRunner } from '../../src/cast/CastRunner';
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

describe('CastDispatcher.dispatch() — executeOnNote vertical', () => {
  let notify: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let runSpy: ReturnType<typeof vi.fn>;
  let castRunner: CastRunner;
  let dispatcher: CastDispatcher;

  beforeEach(() => {
    notify = vi.fn();
    close = vi.fn();
    runSpy = vi.fn();
    castRunner = { run: runSpy } as unknown as CastRunner;
    dispatcher = new CastDispatcher({ notify, close, castRunner });
  });

  // ------------------------------------------------------------------ G1
  it('executeOnNote: false + no active file — runner is invoked and userPrompt does not contain the note path prefix', () => {
    const input = makeBaseInput({ executeOnNote: false, activeFilePath: null });

    dispatcher.dispatch(input);

    // Runner must have been called — no early bail for executeOnNote: false
    expect(runSpy).toHaveBeenCalledOnce();

    // Capture the userPrompt passed to runner.run()
    const [castRunInput] = runSpy.mock.calls[0] as [{ userPrompt: string }, unknown];
    expect(castRunInput.userPrompt).not.toContain('Execute this spell against the note at');
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

    // Runner must NOT have been invoked
    expect(runSpy).not.toHaveBeenCalled();
  });
});
