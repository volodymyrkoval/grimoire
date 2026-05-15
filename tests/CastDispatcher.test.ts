import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CastDispatcher } from '../src/cast/CastDispatcher';
import type { CastInput, CastCallbacks, Caster } from '../src/cast/Caster';
import type { CastLogWriter } from '../src/castLog/CastLogWriter';
import { GrimoireSettings } from '../src/domain/settings/Settings';
import { Spell } from '../src/domain/spells/Spell';

function makeStubCaster() {
  let capturedInput: CastInput | undefined;
  let capturedCallbacks: CastCallbacks | undefined;
  const castFn = vi.fn((input: CastInput, cbs: CastCallbacks) => {
    capturedInput = input;
    capturedCallbacks = cbs;
  });
  const instance: Caster = { cast: castFn };
  return {
    thunk: () => instance,
    getInput: () => capturedInput!,
    getCallbacks: () => capturedCallbacks!,
    castFn,
  };
}

function makeLogWriter(): CastLogWriter {
  return {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
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
  executionMode: 'local',
  portalHost: '',
  portalPort: '',
  portalPath: '',
  portalAuthUser: '',
  portalAuthPassword: '',
};

describe('CastDispatcher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies "Open a note to cast against" and closes when activeFilePath is null', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: closeFn,
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
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
    expect(casterStub.castFn).not.toHaveBeenCalled();
  });

  it('guard when activeFilePath is null and executeOnNote is true: no log entry', () => {
    const logWriter = makeLogWriter();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: makeStubCaster().thunk,
      logWriter: () => logWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: null,
      executeOnNote: true,
    });

    expect(logWriter.recordCasted).not.toHaveBeenCalled();
    expect(logWriter.recordError).not.toHaveBeenCalled();
  });

  it('pre-dispatch guard: remote + empty portalHost notifies and does not record or close', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: closeFn,
      caster: casterStub.thunk,
      logWriter: () => logWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test Spell' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: '' },
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(notifyFn).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(logWriter.recordCasted).not.toHaveBeenCalled();
    expect(closeFn).not.toHaveBeenCalled();
    expect(casterStub.castFn).not.toHaveBeenCalled();
  });

  it('pre-dispatch guard: remote + whitespace-only portalHost notifies and does not record or close', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: closeFn,
      caster: casterStub.thunk,
      logWriter: () => logWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test Spell' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: '   ' },
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(notifyFn).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(logWriter.recordCasted).not.toHaveBeenCalled();
    expect(closeFn).not.toHaveBeenCalled();
    expect(casterStub.castFn).not.toHaveBeenCalled();
  });

  it('constructs prompt with activeFilePath when no context notes or followUp', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(casterStub.getInput().userPrompt).toContain('Execute this spell against the note at `/vault/notes/active.md`.');
  });

  it('appends context notes to prompt when present', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: ['a.md', 'b.md'],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(casterStub.getInput().userPrompt).toContain('Additional context notes: a.md, b.md.');
  });

  it('appends followUp to prompt when present', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: 'then do more',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(casterStub.getInput().userPrompt).toContain('Follow-up: then do more');
  });

  it('invokes caster when executeOnNote is false and activeFilePath is null', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: ['ctx.md'],
      followUp: 'do something',
      settings: baseSettings,
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(casterStub.castFn).toHaveBeenCalled();
    const input = casterStub.getInput();
    expect(input.userPrompt).not.toContain('Execute this spell against the note at');
    expect(input.userPrompt).toContain('Additional context notes: ctx.md.');
    expect(input.userPrompt).toContain('Follow-up: do something');
  });

  it('omits leading sentence when executeOnNote is false even with an active file', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: ['ctx.md'],
      followUp: 'extra instruction',
      settings: baseSettings,
      activeFilePath: 'notes/x.md',
      executeOnNote: false,
    });

    expect(casterStub.castFn).toHaveBeenCalled();
    const input = casterStub.getInput();
    expect(input.userPrompt).not.toContain('Execute this spell against the note at');
    expect(input.userPrompt).toContain('Additional context notes: ctx.md.');
    expect(input.userPrompt).toContain('Follow-up: extra instruction');
  });

  it('includes leading sentence when executeOnNote is true with an active file', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(casterStub.castFn).toHaveBeenCalled();
    expect(casterStub.getInput().userPrompt).toContain('Execute this spell against the note at `/vault/notes/active.md`.');
  });

  it('notifies "Casting <name>…" with single-quoted spell name (local)', () => {
    const notifyFn = vi.fn();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
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

  it('local: caster.cast is called with castId in input', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
      generateId: () => 'fixed-uuid',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    expect(casterStub.getInput().castId).toBe('fixed-uuid');
  });

  it('local: recordCasted called once with expected shape on successful dispatch', () => {
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: () => logWriter,
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

    expect(logWriter.recordCasted).toHaveBeenCalledWith({
      castId: 'fixed-uuid',
      spellPath: 'spells/test.md',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotes: ['ctx1.md', 'ctx2.md'],
      followUp: 'then continue',
      executeOnNote: true,
    });
    expect(logWriter.recordCasted).toHaveBeenCalledTimes(1);
  });

  it('local: onAccepted fires notify "Spell cast"', () => {
    const notifyFn = vi.fn();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    casterStub.getCallbacks().onAccepted({});

    expect(notifyFn).toHaveBeenCalledWith('Spell cast');
  });

  it('local: onAccepted with no jobId does not write a second recordCasted', () => {
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-uuid',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    casterStub.getCallbacks().onAccepted({});

    expect(logWriter.recordCasted).toHaveBeenCalledTimes(1); // only the pre-cast write
    expect(logWriter.recordError).not.toHaveBeenCalled();
  });

  it('local: onFailure calls recordError then notify with "Cast failed: <msg>"', () => {
    const notifyFn = vi.fn();
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-uuid',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: 'notes/active.md',
      executeOnNote: true,
    });

    casterStub.getCallbacks().onFailure('something went wrong');

    expect(logWriter.recordError).toHaveBeenCalledWith({
      castId: 'fixed-uuid',
      message: 'something went wrong',
    });
    expect(logWriter.recordError).toHaveBeenCalledTimes(1);
    expect(notifyFn).toHaveBeenCalledWith('Cast failed: something went wrong');
  });

  it('local: systemPromptFile is set to vault path + spell path', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: baseSettings,
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(casterStub.getInput().systemPromptFile).toBe('/vault/spells/test.md');
  });

  it('remote: notifies "Casting <name> on portal…" and closes', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: closeFn,
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { name: 'Summoning Circle', path: 'spells/summoning.md' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: 'portal.example.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(notifyFn).toHaveBeenCalledWith("Casting 'Summoning Circle' on portal…");
    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  it('remote: recordCasted called before caster.cast with correct shape', () => {
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-id',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: 'portal.example.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(logWriter.recordCasted).toHaveBeenCalledWith(
      expect.objectContaining({ castId: 'fixed-id', spellPath: 'spells/test.md' }),
    );
    expect(casterStub.castFn).toHaveBeenCalled();
  });

  it('remote: systemPromptFile is undefined', () => {
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: 'portal.example.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(casterStub.getInput().systemPromptFile).toBeUndefined();
  });

  it('remote: onAccepted does not notify "Spell cast"', () => {
    const notifyFn = vi.fn();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: makeLogWriter,
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: 'portal.example.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    notifyFn.mockClear();
    casterStub.getCallbacks().onAccepted({});

    expect(notifyFn).not.toHaveBeenCalled();
  });

  it('remote: onFailure writes recordError and notifies with the raw failure message', () => {
    const notifyFn = vi.fn();
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: notifyFn,
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-id',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: 'portal.example.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    casterStub.getCallbacks().onFailure('Portal request timed out.');

    expect(logWriter.recordError).toHaveBeenCalledWith({ castId: 'fixed-id', message: 'Portal request timed out.' });
    expect(notifyFn).toHaveBeenCalledWith('Portal request timed out.');
  });

  it('remote: onAccepted with jobId triggers a second recordCasted containing portalCastId', () => {
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-id',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: 'portal.example.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    // after dispatch: first recordCasted was written (pre-cast)
    expect(logWriter.recordCasted).toHaveBeenCalledTimes(1);

    // onAccepted fires with jobId → second recordCasted with portalCastId
    casterStub.getCallbacks().onAccepted({ jobId: 'srv-1' });
    expect(logWriter.recordCasted).toHaveBeenCalledTimes(2);
    expect(logWriter.recordCasted).toHaveBeenLastCalledWith(
      expect.objectContaining({ castId: 'fixed-id', portalCastId: 'srv-1' }),
    );
  });

  it('remote: onAccepted without jobId does not trigger a second recordCasted', () => {
    const logWriter = makeLogWriter();
    const casterStub = makeStubCaster();

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: casterStub.thunk,
      logWriter: () => logWriter,
      generateId: () => 'id2',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...baseSettings, executionMode: 'remote', portalHost: 'p.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    casterStub.getCallbacks().onAccepted({}); // no jobId
    expect(logWriter.recordCasted).toHaveBeenCalledTimes(1); // only the pre-cast write
  });

  it('uses logWriter resolved at dispatch time, not construction time', () => {
    const localWriter = makeLogWriter();
    const remoteWriter = makeLogWriter();
    const mutableSettings = { ...baseSettings, executionMode: 'local' as 'local' | 'remote' };

    const dispatcher = new CastDispatcher({
      notify: vi.fn(),
      close: vi.fn(),
      caster: makeStubCaster().thunk,
      logWriter: () => mutableSettings.executionMode === 'remote' ? remoteWriter : localWriter,
      generateId: () => 'id',
    });

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: mutableSettings,
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(localWriter.recordCasted).toHaveBeenCalledTimes(1);
    expect(remoteWriter.recordCasted).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mutableSettings.executionMode = 'remote';

    dispatcher.dispatch({
      spell: { path: 'spells/test.md', name: 'Test' } as Spell,
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotePaths: [],
      followUp: '',
      settings: { ...mutableSettings, portalHost: 'portal.example.com' },
      activeFilePath: null,
      executeOnNote: false,
    });

    expect(remoteWriter.recordCasted).toHaveBeenCalledTimes(1);
    expect(localWriter.recordCasted).not.toHaveBeenCalled();
  });
});
