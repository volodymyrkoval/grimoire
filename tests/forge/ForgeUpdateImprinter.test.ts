import { describe, it, expect, vi } from 'vitest';
import { modelId } from '../../src/domain/settings/ModelId';
import { ForgeUpdateImprinter } from '../../src/forge/ForgeUpdateImprinter';
import { GrimoireSettings } from '../../src/domain/settings/Settings';
import { ForgeUpdateFormSnapshot } from '../../src/forge/ForgeUpdateFormSnapshot';
import { FORGE_UPDATE_SPELL_PATH } from '../../src/domain/spells/SystemSpellPaths';
import { spellPath } from '../../src/domain/spells/SpellPath';
import { buildForgeUpdateUserPrompt } from '../../src/forge/buildForgeUpdateUserPrompt';
import type { CastInput, CastCallbacks } from '../../src/execution/Caster';
import type { CastEventSink } from '../../src/forge/CastEventSink';

// Canonical forge-update paths used in all test instances.
const FORGE_UPDATE_ABS = '/vault/.obsidian/plugins/grimoire/forge-update.md';
const FORGE_UPDATE_VAULT_REL = '.obsidian/plugins/grimoire/forge-update.md';
const forgeUpdateSpellPaths = () => ({ absForCaster: FORGE_UPDATE_ABS, vaultRelForPortal: FORGE_UPDATE_VAULT_REL });

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

function makeLogWriterStub(): CastEventSink {
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
  defaultModel: modelId('claude-sonnet-4-5'),
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

const MY_SPELL_PATH = spellPath('spells/my-spell.md');

const baseSnapshot: ForgeUpdateFormSnapshot = {
  spellPath: MY_SPELL_PATH,
  spellName: 'My Spell',
  description: 'Make it better',
  model: modelId('claude-sonnet-4-5'),
  effort: null,
  applyCastDirectives: false,
  directiveCount: 0,
};

describe('ForgeUpdateImprinter', () => {
  it('remote without portalHost: notifies guard, no cast, no log, no close', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(
      baseSnapshot,
      { ...remoteBaseSettings, portalHost: '' },
      closeFn,
    );

    expect(notifyFn).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(closeFn).not.toHaveBeenCalled();
    expect(stubCaster.castFn).not.toHaveBeenCalled();
  });

  it('remote without portalHost: does not call recordCasted or recordError', () => {
    const logWriter = makeLogWriterStub();

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: makeStubCaster().thunk,
      logWriter: () => logWriter,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, { ...remoteBaseSettings, portalHost: '' }, vi.fn());

    expect(logWriter.recordCasted).not.toHaveBeenCalled();
    expect(logWriter.recordError).not.toHaveBeenCalled();
  });

  it('whitespace-only portalHost: same guard fires', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, { ...remoteBaseSettings, portalHost: '   ' }, closeFn);

    expect(notifyFn).toHaveBeenCalledWith('Configure portal host in settings before casting remotely.');
    expect(closeFn).not.toHaveBeenCalled();
    expect(stubCaster.castFn).not.toHaveBeenCalled();
  });

  it('local happy path: notify, close, recordCasted with sentinel and executeOnNote:true, then cast', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-uuid',
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, localBaseSettings, closeFn);

    expect(notifyFn).toHaveBeenCalledWith("Updating 'My Spell'…");
    expect(closeFn).toHaveBeenCalledOnce();
    expect(logWriter.recordCasted).toHaveBeenCalledOnce();
    const logArg = (logWriter.recordCasted as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(logArg).toEqual({
      castId: 'fixed-uuid',
      spellPath: FORGE_UPDATE_SPELL_PATH,
      model: baseSnapshot.model,
      effort: baseSnapshot.effort,
      contextNotes: [],
      executeOnNote: true,
    });
    expect(stubCaster.castFn).toHaveBeenCalledOnce();
  });

  it('local happy path: cast receives executeOnNote:true and activeFilePath = snapshot.spellPath', () => {
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, localBaseSettings, vi.fn());

    const input = stubCaster.getInput();
    expect(input.executeOnNote).toBe(true);
    expect(input.activeFilePath).toBe(MY_SPELL_PATH);
  });

  it('local happy path: cast receives systemPromptFile pointing at the absolute forge-update path', () => {
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, localBaseSettings, vi.fn());

    expect(stubCaster.getInput().systemPromptFile).toBe(FORGE_UPDATE_ABS);
  });

  it('local happy path: cast receives spellPath set to vault-relative forge-update path', () => {
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, localBaseSettings, vi.fn());

    expect(stubCaster.getInput().spellPath).toBe(FORGE_UPDATE_VAULT_REL);
  });

  it('local happy path: cast receives castId', () => {
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      generateId: () => 'fixed-uuid',
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, localBaseSettings, vi.fn());

    expect(stubCaster.getInput().castId).toBe('fixed-uuid');
  });

  it('local onAccepted: emits success notice, no second recordCasted', () => {
    const logWriter = makeLogWriterStub();
    const notifyFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, localBaseSettings, vi.fn());
    stubCaster.getCallbacks().onAccepted({});

    expect(logWriter.recordCasted).toHaveBeenCalledOnce();
    expect(notifyFn).toHaveBeenCalledTimes(2);
    expect(notifyFn).toHaveBeenLastCalledWith("Spell 'My Spell' updated");
    expect(logWriter.recordError).not.toHaveBeenCalled();
  });

  it('local onFailure: recordError then notify "Forge update failed: <msg>"', () => {
    const logWriter = makeLogWriterStub();
    const notifyFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'fixed-uuid',
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, localBaseSettings, vi.fn());
    stubCaster.getCallbacks().onFailure('bad error');

    expect(logWriter.recordError).toHaveBeenCalledOnce();
    expect(logWriter.recordError).toHaveBeenCalledWith({ castId: 'fixed-uuid', message: 'bad error' });
    expect(notifyFn).toHaveBeenCalledWith('Forge update failed: bad error');
  });

  it('remote happy path: notify "Updating ... on portal…", close, cast', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, remoteBaseSettings, closeFn);

    expect(notifyFn).toHaveBeenCalledWith("Updating 'My Spell' on portal…");
    expect(closeFn).toHaveBeenCalledOnce();
    expect(stubCaster.castFn).toHaveBeenCalledOnce();
  });

  it('remote onAccepted with jobId: second recordCasted with portalCastId', () => {
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'update-id',
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, remoteBaseSettings, vi.fn());
    stubCaster.getCallbacks().onAccepted({ jobId: 'srv-update-1' });

    expect(logWriter.recordCasted).toHaveBeenCalledTimes(2);
    expect(logWriter.recordCasted).toHaveBeenLastCalledWith(
      expect.objectContaining({ castId: 'update-id', portalCastId: 'srv-update-1' }),
    );
  });

  it('remote onAccepted without jobId: no second recordCasted', () => {
    const logWriter = makeLogWriterStub();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, remoteBaseSettings, vi.fn());
    stubCaster.getCallbacks().onAccepted({});

    expect(logWriter.recordCasted).toHaveBeenCalledTimes(1);
  });

  it('remote onFailure: recordError + notify with raw message (no prefix)', () => {
    const logWriter = makeLogWriterStub();
    const notifyFn = vi.fn();
    const stubCaster = makeStubCaster();

    const imprinter = new ForgeUpdateImprinter({
      notify: notifyFn,
      caster: stubCaster.thunk,
      logWriter: () => logWriter,
      generateId: () => 'update-id',
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, remoteBaseSettings, vi.fn());
    stubCaster.getCallbacks().onFailure('Portal returned 500: boom.');

    expect(logWriter.recordError).toHaveBeenCalledOnce();
    expect(logWriter.recordError).toHaveBeenCalledWith({
      castId: 'update-id',
      message: 'Portal returned 500: boom.',
    });
    expect(notifyFn).toHaveBeenCalledWith('Portal returned 500: boom.');
  });

  it('applyCastDirectives:true — userPrompt contains correct snapshot values', () => {
    const stubCaster = makeStubCaster();
    const snapshot: ForgeUpdateFormSnapshot = {
      ...baseSnapshot,
      applyCastDirectives: true,
      directiveCount: 3,
      description: 'Improve clarity',
    };

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(snapshot, localBaseSettings, vi.fn());

    const expectedPrompt = buildForgeUpdateUserPrompt({
      spellPath: snapshot.spellPath,
      spellName: snapshot.spellName,
      description: snapshot.description,
      applyCastDirectives: true,
      directiveCount: 3,
      model: snapshot.model,
      effort: snapshot.effort,
    });
    expect(stubCaster.getInput().userPrompt).toBe(expectedPrompt);
  });

  it('applyCastDirectives:false — userPrompt contains correct snapshot values', () => {
    const stubCaster = makeStubCaster();
    const snapshot: ForgeUpdateFormSnapshot = {
      ...baseSnapshot,
      applyCastDirectives: false,
      directiveCount: 0,
      description: 'Tweak wording',
    };

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: stubCaster.thunk,
      logWriter: makeLogWriterStub,
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(snapshot, localBaseSettings, vi.fn());

    const expectedPrompt = buildForgeUpdateUserPrompt({
      spellPath: snapshot.spellPath,
      spellName: snapshot.spellName,
      description: snapshot.description,
      applyCastDirectives: false,
      directiveCount: 0,
      model: snapshot.model,
      effort: snapshot.effort,
    });
    expect(stubCaster.getInput().userPrompt).toBe(expectedPrompt);
  });

  it('uses logWriter resolved at imprint time, not construction time', () => {
    const localWriter = makeLogWriterStub();
    const remoteWriter = makeLogWriterStub();
    const mutableSettings = { ...localBaseSettings };

    const imprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: makeStubCaster().thunk,
      logWriter: () => mutableSettings.executionMode === 'remote' ? remoteWriter : localWriter,
      generateId: () => 'id',
      forgeUpdateSpellPaths,
    });

    imprinter.imprint(baseSnapshot, mutableSettings, vi.fn());

    expect(localWriter.recordCasted).toHaveBeenCalledTimes(1);
    expect(remoteWriter.recordCasted).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mutableSettings.executionMode = 'remote';

    imprinter.imprint(baseSnapshot, { ...mutableSettings, portalHost: 'portal.example.com' }, vi.fn());

    expect(remoteWriter.recordCasted).toHaveBeenCalledTimes(1);
    expect(localWriter.recordCasted).not.toHaveBeenCalled();
  });
});
