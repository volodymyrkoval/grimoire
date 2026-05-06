import { describe, it, expect, vi } from 'vitest';
import { CastDispatcher } from '../src/cast/CastDispatcher';
import { CastRunner, CastRunCallbacks } from '../src/cast/CastRunner';
import { GrimoireSettings } from '../src/domain/settings/Settings';
import { Spell } from '../src/domain/spells/Spell';

function makeStubRunner() {
  let capturedInput: any;
  let capturedCallbacks: CastRunCallbacks | undefined;

  const stub = {
    run: vi.fn((input: any, callbacks: CastRunCallbacks) => {
      capturedInput = input;
      capturedCallbacks = callbacks;
    }),
  };

  return {
    stub: stub as any as CastRunner,
    getInput: () => capturedInput,
    getCallbacks: () => capturedCallbacks,
  };
}

describe('CastDispatcher', () => {
  it('notifies "Open a note to cast against" and closes when activeFilePath is null', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const { stub } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: closeFn,
      castRunner: stub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      activeFilePath: null,
    });

    expect(notifyFn).toHaveBeenCalledWith('Open a note to cast against');
    expect(closeFn).toHaveBeenCalled();
    expect(stub.run).not.toHaveBeenCalled();
  });

  it('constructs prompt with activeFilePath when no context notes or followUp', () => {
    const { stub, getInput } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      activeFilePath: 'notes/active.md',
    });

    const input = getInput();
    expect(input.userPrompt).toContain('Execute this spell against the note at `/vault/notes/active.md`.');
  });

  it('appends context notes to prompt when present', () => {
    const { stub, getInput } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: ['a.md', 'b.md'],
      followUp: '',
      settings: {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      activeFilePath: 'notes/active.md',
    });

    const input = getInput();
    expect(input.userPrompt).toContain('Additional context notes: a.md, b.md.');
  });

  it('appends followUp to prompt when present', () => {
    const { stub, getInput } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: 'then do more',
      settings: {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      activeFilePath: 'notes/active.md',
    });

    const input = getInput();
    expect(input.userPrompt).toContain('Follow-up: then do more');
  });

  it('calls onSuccess callback from runner', () => {
    const notifyFn = vi.fn();
    const { stub, getCallbacks } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      castRunner: stub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      activeFilePath: 'notes/active.md',
    });

    const callbacks = getCallbacks();
    callbacks?.onSuccess();

    expect(notifyFn).toHaveBeenCalledWith('Spell cast');
  });

  it('calls onFailure callback with error message from runner', () => {
    const notifyFn = vi.fn();
    const { stub, getCallbacks } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      castRunner: stub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      activeFilePath: 'notes/active.md',
    });

    const callbacks = getCallbacks();
    callbacks?.onFailure('something went wrong');

    expect(notifyFn).toHaveBeenCalledWith('Cast failed: something went wrong');
  });

  it('notifies "Casting <name>…" with single-quoted spell name', () => {
    const notifyFn = vi.fn();
    const { stub } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      castRunner: stub,
    });

    dispatcher.dispatch({
      spell: { name: 'Summoning Circle', path: 'spells/summoning.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      activeFilePath: 'notes/active.md',
    });

    expect(notifyFn).toHaveBeenCalledWith("Casting 'Summoning Circle'…");
  });
});
