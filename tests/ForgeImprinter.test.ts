import { describe, it, expect, vi } from 'vitest';
import { ForgeImprinter } from '../src/forge/ForgeImprinter';
import { CastRunner, CastRunCallbacks } from '../src/cast/CastRunner';
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

describe('ForgeImprinter', () => {
  it('notifies invalid name and closes when name sanitises to empty', () => {
    const notifyFn = vi.fn();
    const closeFn = vi.fn();
    const { stub } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
    });

    imprinter.imprint(
      {
        name: '<>',
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
    });

    imprinter.imprint(
      {
        name: 'My Spell',
        description: 'test description',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
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
    });

    imprinter.imprint(
      {
        name: 'Test Spell',
        description: 'A test spell',
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

    const input = getInput();
    expect(input.metaSpell).toContain('- **Name (already sanitised):** Test Spell');
    expect(input.metaSpell).toContain('- **Description:** A test spell');
  });

  it('calls onSuccess callback with success toast', () => {
    const { stub, getCallbacks } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
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

    const notifyFn = vi.fn();
    const imprinter2 = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
    });

    imprinter2.imprint(
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
    const { stub, getCallbacks } = makeStubRunner();

    const imprinter = new ForgeImprinter({
      notify: vi.fn(),
      castRunner: stub,
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

    const notifyFn = vi.fn();
    const imprinter2 = new ForgeImprinter({
      notify: notifyFn,
      castRunner: stub,
    });

    imprinter2.imprint(
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
    callbacks?.onFailure('boom');

    expect(notifyFn).toHaveBeenCalledWith('Forge failed: boom');
  });
});
