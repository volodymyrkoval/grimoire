import { describe, it, expect, vi } from 'vitest';
import { ForgeImprinter } from '../src/forge/ForgeImprinter';
import { CastRunner, CastRunCallbacks } from '../src/cast/CastRunner';
import { CastLogStore } from '../src/castLog/store';
import { GrimoireSettings } from '../src/domain/settings/Settings';
import { ForgeFormSnapshot } from '../src/forge/ForgeFormSnapshot';

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

function makeStubCastLogStore() {
  return {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  } as unknown as CastLogStore;
}

describe('ForgeImprinter', () => {
  it('notifies invalid name and closes when name sanitises to empty', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const { stub } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
      castLogStore: makeStubCastLogStore(),
    });

    imprinter.imprint(
      {
        name: '<>',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      closeFn
    );

    expect(notifyFn).toHaveBeenCalledWith('Spell name is invalid after sanitisation');
    expect(closeFn).toHaveBeenCalled();
    expect(stub.run).not.toHaveBeenCalled();
  });

  it('notifies forging and close on valid name, then calls runner', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const { stub } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
      castLogStore: makeStubCastLogStore(),
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test description',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        executeOnNote: true,
      } as ForgeFormSnapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      closeFn
    );

    expect(notifyFn).toHaveBeenCalledWith('Forging "My Spell"…');
    expect(closeFn).toHaveBeenCalled();
    expect(stub.run).toHaveBeenCalled();
  });

  it('passes metaSpell to runner with name and description', () => {
    const { stub, getInput } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
      castLogStore: makeStubCastLogStore(),
    });

    imprinter.imprint(
      {
        name: 'Test Spell',
        description: 'A test spell',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    const input = getInput();
    expect(input.metaSpell).toContain('- **Name (already sanitised):** Test Spell');
    expect(input.metaSpell).toContain('- **Description:** A test spell');
  });

  it('calls onSuccess callback with success toast', () => {
    const notifyFn = vi.fn();
    const { stub, getCallbacks } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
      castLogStore: makeStubCastLogStore(),
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
      } as ForgeFormSnapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    const callbacks = getCallbacks();
    callbacks?.onSuccess();

    expect(notifyFn).toHaveBeenCalledWith('Spell "My Spell" forged');
  });

  it('calls onFailure callback with failure toast', () => {
    const notifyFn = vi.fn();
    const { stub, getCallbacks } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
      castLogStore: makeStubCastLogStore(),
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    const callbacks = getCallbacks();
    callbacks?.onFailure('boom');

    expect(notifyFn).toHaveBeenCalledWith('Forge failed: boom');
  });

  it('threads executeOnNote: false into metaSpell', () => {
    const { stub, getInput } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
      castLogStore: makeStubCastLogStore(),
    });

    imprinter.imprint(
      {
        name: 'Test Spell',
        description: 'A test spell',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: false,
      } as ForgeFormSnapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    const input = getInput();
    expect(input.metaSpell).toContain('grimoire-execute-on-note: false');
  });

  it('empty-name guard calls neither recordCasted nor recordError', () => {
    const recordCastedFn = vi.fn().mockResolvedValue(undefined);
    const recordErrorFn = vi.fn().mockResolvedValue(undefined);
    const castLogStoreMock = {
      recordCasted: recordCastedFn,
      recordError: recordErrorFn,
    } as unknown as CastLogStore;
    const { stub } = makeStubRunner();
    const closeFn = vi.fn();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
      castLogStore: castLogStoreMock,
    });

    imprinter.imprint(
      {
        name: '<>',
        description: 'test',
        model: 'claude-sonnet-4-5',
        effort: null,
        executeOnNote: true,
      } as ForgeFormSnapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      closeFn
    );

    expect(recordCastedFn).not.toHaveBeenCalled();
    expect(recordErrorFn).not.toHaveBeenCalled();
  });

  it('valid imprint calls recordCasted once with correct shape (forge variant)', () => {
    const recordCastedFn = vi.fn().mockResolvedValue(undefined);
    const castLogStoreMock = {
      recordCasted: recordCastedFn,
      recordError: vi.fn().mockResolvedValue(undefined),
    } as unknown as CastLogStore;
    const { stub } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
      castLogStore: castLogStoreMock,
      generateId: () => 'fixed-uuid',
    });

    const snapshot = {
      name: 'My Spell',
      description: 'test',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      executeOnNote: true,
    } as ForgeFormSnapshot;

    imprinter.imprint(
      snapshot,
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    expect(recordCastedFn).toHaveBeenCalledOnce();
    const callArg = recordCastedFn.mock.calls[0][0];
    expect(callArg).toEqual({
      castId: 'fixed-uuid',
      spellPath: '<forge>',
      model: snapshot.model,
      effort: snapshot.effort,
      contextNotes: [],
    });
    // Assert no followUp or executeOnNote keys
    expect(Object.keys(callArg).sort()).toEqual(['castId', 'contextNotes', 'effort', 'model', 'spellPath']);
  });

  it('castRunner.run receives castId in its input', () => {
    const { stub, getInput } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
      castLogStore: makeStubCastLogStore(),
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
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    const input = getInput();
    expect(input.castId).toBe('fixed-uuid');
  });

  it('onFailure callback records error and notifies', () => {
    const recordErrorFn = vi.fn().mockResolvedValue(undefined);
    const castLogStoreMock = {
      recordCasted: vi.fn().mockResolvedValue(undefined),
      recordError: recordErrorFn,
    } as unknown as CastLogStore;
    const notifyFn = vi.fn();
    const { stub, getCallbacks } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
      castLogStore: castLogStoreMock,
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
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    const callbacks = getCallbacks();
    callbacks?.onFailure('boom');

    expect(recordErrorFn).toHaveBeenCalledOnce();
    expect(recordErrorFn).toHaveBeenCalledWith({
      castId: 'fixed-uuid',
      message: 'boom',
    });
    expect(notifyFn).toHaveBeenCalledWith('Forge failed: boom');
  });

  it('onSuccess produces no log write', () => {
    const recordCastedFn = vi.fn().mockResolvedValue(undefined);
    const recordErrorFn = vi.fn().mockResolvedValue(undefined);
    const castLogStoreMock = {
      recordCasted: recordCastedFn,
      recordError: recordErrorFn,
    } as unknown as CastLogStore;
    const { stub, getCallbacks } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
      castLogStore: castLogStoreMock,
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
      {
        vaultMountPath: '/vault',
        spellTag: 'grimoire/spell',
        binaryPath: '/usr/bin/claude',
        cliCommand: 'claude',
        forgeOutputFolder: 'Spells/',
        defaultModel: 'claude-sonnet-4-5',
        defaultEffort: null,
      } as GrimoireSettings,
      vi.fn()
    );

    const callbacks = getCallbacks();
    callbacks?.onSuccess();

    // recordCasted was called once on dispatch
    expect(recordCastedFn).toHaveBeenCalledOnce();
    // recordError should never be called
    expect(recordErrorFn).not.toHaveBeenCalled();
  });
});
