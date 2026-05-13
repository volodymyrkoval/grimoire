import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastDispatcher } from '../src/cast/CastDispatcher';
import type { CastLogStore } from '../src/castLog/store';
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

const baseSettings: GrimoireSettings = {
  vaultMountPath: '/vault',
  spellTag: 'grimoire/spell',
  binaryPath: '/usr/bin/claude',
  cliCommand: 'claude',
  forgeOutputFolder: 'Spells/',
  defaultModel: 'claude-sonnet-4-5',
  defaultEffort: null,
};

describe('CastDispatcher', () => {
  const castLogStoreStub = {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  } as unknown as CastLogStore;

  beforeEach(() => vi.clearAllMocks());

  it('notifies "Open a note to cast against" and closes when activeFilePath is null', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const { stub } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: closeFn,
      castRunner: stub,
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: null,
      executeOnNote: true,
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
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
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
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: ['a.md', 'b.md'],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
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
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: 'then do more',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
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
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
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
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
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
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { name: 'Summoning Circle', path: 'spells/summoning.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(notifyFn).toHaveBeenCalledWith("Casting 'Summoning Circle'…");
  });

  it('invokes runner when executeOnNote is false and activeFilePath is null', () => {
    const { stub, getInput } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: ['ctx.md'],
      followUp: 'do something',
      settings: baseSettings,
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(stub.run).toHaveBeenCalled();
    const input = getInput();
    expect(input.userPrompt).not.toContain('Execute this spell against the note at');
    expect(input.userPrompt).toContain('Additional context notes: ctx.md.');
    expect(input.userPrompt).toContain('Follow-up: do something');
  });

  it('omits leading sentence when executeOnNote is false even with an active file', () => {
    const { stub, getInput } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: ['ctx.md'],
      followUp: 'extra instruction',
      settings: baseSettings,
      activeFilePath: 'notes/x.md',
      executeOnNote: false,
    });

    expect(stub.run).toHaveBeenCalled();
    const input = getInput();
    expect(input.userPrompt).not.toContain('Execute this spell against the note at');
    expect(input.userPrompt).toContain('Additional context notes: ctx.md.');
    expect(input.userPrompt).toContain('Follow-up: extra instruction');
  });

  it('includes leading sentence when executeOnNote is true with an active file', () => {
    const { stub, getInput } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
      castLogStore: castLogStoreStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(stub.run).toHaveBeenCalled();
    const input = getInput();
    expect(input.userPrompt).toContain('Execute this spell against the note at `/vault/notes/active.md`.');
  });

  it('guard when activeFilePath is null and executeOnNote is true: no log entry', () => {
    const recordCasted = vi.fn().mockResolvedValue(undefined);
    const recordError = vi.fn().mockResolvedValue(undefined);
    const storeStub = { recordCasted, recordError } as unknown as CastLogStore;

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castLogStore: storeStub,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: null,
      executeOnNote: true,
    });

    expect(recordCasted).not.toHaveBeenCalled();
    expect(recordError).not.toHaveBeenCalled();
  });

  it('successful dispatch calls recordCasted once with expected shape', () => {
    const recordCasted = vi.fn().mockResolvedValue(undefined);
    const storeStub = { recordCasted, recordError: vi.fn() } as unknown as CastLogStore;
    const { stub } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
      castLogStore: storeStub,
      generateId: () => 'fixed-uuid',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test Spell' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotePaths: ['ctx1.md', 'ctx2.md'],
      followUp: 'then continue',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(recordCasted).toHaveBeenCalledWith({
      castId: 'fixed-uuid',
      spellPath: 'spells/test.md',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotes: ['ctx1.md', 'ctx2.md'],
      followUp: 'then continue',
      executeOnNote: true,
    });
    expect(recordCasted).toHaveBeenCalledTimes(1);
  });

  it('runner.run is called with castId in input', () => {
    const storeStub = { recordCasted: vi.fn().mockResolvedValue(undefined), recordError: vi.fn() } as unknown as CastLogStore;
    const { stub, getInput } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
      castLogStore: storeStub,
      generateId: () => 'fixed-uuid',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    const input = getInput();
    expect(input.castId).toBe('fixed-uuid');
  });

  it('onFailure calls recordError then notify with failure message', () => {
    const notifyFn = vi.fn();
    const recordError = vi.fn().mockResolvedValue(undefined);
    const storeStub = { recordCasted: vi.fn().mockResolvedValue(undefined), recordError } as unknown as CastLogStore;
    const { stub, getCallbacks } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      castRunner: stub,
      castLogStore: storeStub,
      generateId: () => 'fixed-uuid',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    const callbacks = getCallbacks();
    callbacks?.onFailure('boom');

    expect(recordError).toHaveBeenCalledWith({
      castId: 'fixed-uuid',
      message: 'boom',
    });
    expect(recordError).toHaveBeenCalledTimes(1);
    expect(notifyFn).toHaveBeenCalledWith('Cast failed: boom');
  });

  it('onSuccess produces no log write', () => {
    const recordCasted = vi.fn().mockResolvedValue(undefined);
    const recordError = vi.fn().mockResolvedValue(undefined);
    const storeStub = { recordCasted, recordError } as unknown as CastLogStore;
    const { stub, getCallbacks } = makeStubRunner();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      castRunner: stub,
      castLogStore: storeStub,
      generateId: () => 'fixed-uuid',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    const callbacks = getCallbacks();
    callbacks?.onSuccess();

    expect(recordCasted).toHaveBeenCalledTimes(1); // only from dispatch, not from onSuccess
    expect(recordError).not.toHaveBeenCalled();
  });
});
