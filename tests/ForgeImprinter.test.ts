import { describe, it, expect, vi } from 'vitest';
import { ForgeImprinter } from '../src/forge/ForgeImprinter';
import { GrimoireSettings } from '../src/domain/settings/Settings';
import { ForgeFormSnapshot } from '../src/forge/ForgeFormSnapshot';
import type { CastInput, CastCallbacks } from '../src/cast/Caster';
import type { CastLogWriter } from '../src/castLog/CastLogWriter';

function makeStubCaster() {
  let capturedInput: CastInput | undefined;
  let capturedCallbacks: CastCallbacks | undefined;
  const castFn = vi.fn((input: CastInput, cbs: CastCallbacks) => {
    capturedInput = input;
    capturedCallbacks = cbs;
  });
  const instance = { cast: castFn };
  return {
    thunk: () => instance,
    getInput: () => capturedInput!,
    getCallbacks: () => capturedCallbacks!,
    castFn,
  };
}

function makeLogWriterStub(): CastLogWriter {
  return {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  };
}

const localBaseSettings: GrimoireSettings = {
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

const remoteBaseSettings: GrimoireSettings = {
  ...localBaseSettings,
  executionMode: 'remote',
  portalHost: 'portal.example.com',
  portalPort: '',
  portalPath: '',
  portalAuthUser: 'alice',
  portalAuthPassword: 'secret',
};

describe('ForgeImprinter', () => {
  it('notifies invalid name and closes when name sanitises to empty', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: '<>',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      closeFn
    );

    expect(notifyFn).toHaveBeenCalledWith('Spell name is invalid after sanitisation');
    expect(closeFn).toHaveBeenCalled();
    expect(stubCaster.castFn).not.toHaveBeenCalled();
  });

  it('notifies forging and close on valid name, then calls caster.cast', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test description',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      closeFn
    );

    expect(notifyFn).toHaveBeenCalledWith("Forging 'My Spell'…");
    expect(closeFn).toHaveBeenCalled();
    expect(stubCaster.castFn).toHaveBeenCalled();
  });

  it('passes metaSpell to caster with name and description in userPrompt', () => {
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: 'Test Spell',
        description: 'A test spell',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    const input = stubCaster.getInput();
    expect(input.userPrompt).toContain('- **Name (already sanitised):** Test Spell');
    expect(input.userPrompt).toContain('- **Description:** A test spell');
  });

  it('calls onAccepted callback with success toast for local mode', () => {
    const notifyFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: false,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    stubCaster.getCallbacks().onAccepted({});

    expect(notifyFn).toHaveBeenCalledWith('Spell "My Spell" forged');
  });

  it('calls onFailure callback with failure toast', () => {
    const notifyFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    stubCaster.getCallbacks().onFailure('boom');

    expect(notifyFn).toHaveBeenCalledWith('Forge failed: boom');
  });

  it('threads executeOnNote: false into metaSpell', () => {
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: 'Test Spell',
        description: 'A test spell',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: false,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    const input = stubCaster.getInput();
    expect(input.userPrompt).toContain('grimoire-execute-on-note: false');
  });

  it('empty-name guard calls neither recordCasted nor recordError', () => {
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
    });

    imprinter.imprint(
      {
        name: '<>',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    expect(logWriter.recordCasted).not.toHaveBeenCalled();
    expect(logWriter.recordError).not.toHaveBeenCalled();
  });

  it('valid imprint calls recordCasted once with correct shape (forge variant)', () => {
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-uuid',
    });

    const snapshot = {
      name: 'My Spell',
      description: 'test',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      executeOnNote: true,
    } as ForgeFormSnapshot;

    imprinter.imprint(snapshot, localBaseSettings, vi.fn());

    expect(logWriter.recordCasted).toHaveBeenCalledOnce();
    const callArg = (logWriter.recordCasted as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toEqual({
      castId: 'fixed-uuid',
      spellPath: '<forge>',
      model: snapshot.model,
      effort: snapshot.effort,
      contextNotes: [],
    });
    expect(Object.keys(callArg).sort()).toEqual(['castId', 'contextNotes', 'effort', 'model', 'spellPath']);
  });

  it('caster.cast receives castId in its input', () => {
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      generateId: () => 'fixed-uuid',
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    expect(stubCaster.getInput().castId).toBe('fixed-uuid');
  });

  it('onFailure callback records error and notifies', () => {
    const logWriter = makeLogWriterStub();
    const notifyFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-uuid',
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    stubCaster.getCallbacks().onFailure('boom');

    expect(logWriter.recordError).toHaveBeenCalledOnce();
    expect(logWriter.recordError).toHaveBeenCalledWith({
      castId: 'fixed-uuid',
      message: 'boom',
    });
    expect(notifyFn).toHaveBeenCalledWith('Forge failed: boom');
  });

  it('empty-host guard: notifies exact message, no close, caster never called', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      { ...remoteBaseSettings, portalHost: '' },
      closeFn
    );

    expect(notifyFn).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(closeFn).not.toHaveBeenCalled();
    expect(stubCaster.castFn).not.toHaveBeenCalled();
  });

  it('whitespace-only host guard: fires same guard as empty host', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      { ...remoteBaseSettings, portalHost: '   ' },
      closeFn
    );

    expect(notifyFn).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(closeFn).not.toHaveBeenCalled();
    expect(stubCaster.castFn).not.toHaveBeenCalled();
  });

  it('remote happy path: recordCasted, notice on portal, close, caster.cast called', () => {
    const logWriter = makeLogWriterStub();
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'Does things',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        executeOnNote: false,
      } as ForgeFormSnapshot,
      remoteBaseSettings,
      closeFn
    );

    expect(logWriter.recordCasted).toHaveBeenCalledOnce();
    const callArg = (logWriter.recordCasted as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toMatchObject({ castId: 'forge-id', spellPath: '<forge>' });

    expect(notifyFn).toHaveBeenCalledWith("Forging 'My Spell' on portal…");
    expect(closeFn).toHaveBeenCalledOnce();
    expect(stubCaster.castFn).toHaveBeenCalledOnce();
  });

  it('remote onAccepted with jobId: second recordCasted with portalCastId', () => {
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'Does things',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        executeOnNote: false,
      } as ForgeFormSnapshot,
      remoteBaseSettings,
      vi.fn()
    );

    stubCaster.getCallbacks().onAccepted({ jobId: 'srv-forge-1' });

    expect(logWriter.recordCasted).toHaveBeenCalledTimes(2);
    expect(logWriter.recordCasted).toHaveBeenLastCalledWith(
      expect.objectContaining({ castId: 'forge-id', portalCastId: 'srv-forge-1' })
    );
  });

  it('remote onAccepted without jobId: no second recordCasted', () => {
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'Does things',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        executeOnNote: false,
      } as ForgeFormSnapshot,
      remoteBaseSettings,
      vi.fn()
    );

    stubCaster.getCallbacks().onAccepted({});

    expect(logWriter.recordCasted).toHaveBeenCalledTimes(1);
  });

  it('remote onFailure: recordError + notify with message (no Forge failed: prefix)', () => {
    const logWriter = makeLogWriterStub();
    const notifyFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'Does things',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        executeOnNote: false,
      } as ForgeFormSnapshot,
      remoteBaseSettings,
      vi.fn()
    );

    stubCaster.getCallbacks().onFailure('Portal returned 500: boom.');

    expect(logWriter.recordError).toHaveBeenCalledOnce();
    expect(logWriter.recordError).toHaveBeenCalledWith({
      castId: 'forge-id',
      message: 'Portal returned 500: boom.',
    });
    expect(notifyFn).toHaveBeenCalledWith('Portal returned 500: boom.');
  });

  it('local onAccepted produces no second log write', () => {
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-uuid',
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      localBaseSettings,
      vi.fn()
    );

    stubCaster.getCallbacks().onAccepted({});

    expect(logWriter.recordCasted).toHaveBeenCalledOnce();
    expect(logWriter.recordError).not.toHaveBeenCalled();
  });

  // E5: second-recordCasted contract test
  it('remote: onAccepted with jobId triggers second recordCasted with portalCastId', () => {
    const logWriter = makeLogWriterStub();
    const { thunk, getCallbacks } = makeStubCaster();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: thunk,
      logWriter: () => logWriter,
      generateId: () => 'forge-id',
    });

    imprinter.imprint(
      { name: 'My Spell', description: 'desc', model: 'claude-sonnet-4-5', effort: null, executeOnNote: false },
      { ...remoteBaseSettings },
      vi.fn()
    );

    expect(logWriter.recordCasted).toHaveBeenCalledTimes(1);

    getCallbacks().onAccepted({ jobId: 'srv-forge-1' });
    expect(logWriter.recordCasted).toHaveBeenCalledTimes(2);
    expect(logWriter.recordCasted).toHaveBeenLastCalledWith(
      expect.objectContaining({ castId: 'forge-id', portalCastId: 'srv-forge-1' })
    );

    // no jobId → no second write
    const logWriter2 = makeLogWriterStub();
    const caster2 = makeStubCaster();
    const imprinter2 = new ForgeImprinter({
      notify: vi.fn(),
      caster: caster2.thunk,
      logWriter: () => logWriter2,
      generateId: () => 'id2',
    });
    imprinter2.imprint(
      { name: 'X', description: 'd', model: 'claude-sonnet-4-5', effort: null, executeOnNote: false },
      { ...remoteBaseSettings },
      vi.fn()
    );
    caster2.getCallbacks().onAccepted({});
    expect(logWriter2.recordCasted).toHaveBeenCalledTimes(1);
  });

  // ── logWriter thunk: resolved per-imprint, not captured at construction ──────

  it('uses logWriter resolved at imprint time, not construction time', () => {
    const localWriter = makeLogWriterStub();
    const remoteWriter = makeLogWriterStub();
    const mutableSettings = { ...localBaseSettings, executionMode: 'local' as 'local' | 'remote' };

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      caster: makeStubCaster().thunk,
      logWriter: () => mutableSettings.executionMode === 'remote' ? remoteWriter : localWriter,
      generateId: () => 'id',
    });

    const snapshot: ForgeFormSnapshot = {
      name: 'My Spell',
      description: 'test',
      model: 'claude-sonnet-4-5',
      effort: null,
      executeOnNote: false,
    };

    imprinter.imprint(snapshot, mutableSettings, vi.fn());

    expect(localWriter.recordCasted).toHaveBeenCalledTimes(1);
    expect(remoteWriter.recordCasted).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mutableSettings.executionMode = 'remote';

    imprinter.imprint(snapshot, { ...mutableSettings, portalHost: 'portal.example.com' }, vi.fn());

    expect(remoteWriter.recordCasted).toHaveBeenCalledTimes(1);
    expect(localWriter.recordCasted).not.toHaveBeenCalled();
  });
});
