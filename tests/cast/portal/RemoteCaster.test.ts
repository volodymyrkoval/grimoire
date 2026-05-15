import { describe, it, expect, vi } from 'vitest';
import { RemoteCaster } from '../../../src/cast/portal/RemoteCaster';
import type { RemoteCastInput, RemoteCastCallbacks } from '../../../src/cast/portal/RemoteCastTransport';
import type { RemoteCastTransport } from '../../../src/cast/portal/RemoteCastTransport';
import { mapPortalError } from '../../../src/cast/portal/mapPortalError';
import type { GrimoireSettings } from '../../../src/domain/settings/Settings';
import type { CastInput, CastCallbacks } from '../../../src/cast/Caster';

const makeTransportStub = (behavior: (input: RemoteCastInput, cbs: RemoteCastCallbacks) => void) =>
  ({
    run: vi.fn((input, cbs) => behavior(input, cbs)),
  }) as unknown as RemoteCastTransport;

const baseSettings: GrimoireSettings = {
  spellTag: 'grimoire/spell',
  cliCommand: 'claude',
  binaryPath: '',
  forgeOutputFolder: 'Spells/',
  vaultMountPath: '/vault',
  defaultModel: 'claude-sonnet-4-5',
  defaultEffort: 'medium',
  executionMode: 'remote',
  portalHost: 'localhost',
  portalPort: '8080',
  portalPath: '/cast',
  portalAuthUser: 'user',
  portalAuthPassword: 'pass',
};

const baseInput: CastInput = {
  castId: 'cast-1',
  spellPath: 'spell.md',
  modelId: 'claude-sonnet-4-5',
  effort: 'medium',
  userPrompt: 'Hello',
  vaultMountPath: '/vault',
};

describe('RemoteCaster', () => {
  it('calls onAccepted with jobId when transport fires onAccepted with portalCastId', () => {
    const transport = makeTransportStub((_input, cbs) => {
      cbs.onAccepted({ portalCastId: 'srv-x' });
    });
    const caster = new RemoteCaster({ transport, settings: baseSettings });

    const onAccepted = vi.fn();
    const onFailure = vi.fn();
    const callbacks: CastCallbacks = { onAccepted, onFailure };

    caster.cast(baseInput, callbacks);

    expect(onAccepted).toHaveBeenCalledOnce();
    expect(onAccepted).toHaveBeenCalledWith({ jobId: 'srv-x' });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does not call onAccepted when transport silently skips (202 without castId)', () => {
    const transport = makeTransportStub((_input, _cbs) => {
      // transport does nothing — mirrors 202-without-castId silence
    });
    const caster = new RemoteCaster({ transport, settings: baseSettings });

    const onAccepted = vi.fn();
    const onFailure = vi.fn();

    caster.cast(baseInput, { onAccepted, onFailure });

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('calls onFailure with network error notice', () => {
    const expectedNotice = mapPortalError({ kind: 'network', message: 'ECONNREFUSED', host: 'localhost' }).notice;
    const transport = makeTransportStub((_input, cbs) => {
      cbs.onFailure(expectedNotice);
    });
    const caster = new RemoteCaster({ transport, settings: baseSettings });

    const onFailure = vi.fn();

    caster.cast(baseInput, { onAccepted: vi.fn(), onFailure });

    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(expectedNotice);
  });

  it('calls onFailure with timeout notice', () => {
    const expectedNotice = mapPortalError({ kind: 'timeout' }).notice;
    const transport = makeTransportStub((_input, cbs) => {
      cbs.onFailure(expectedNotice);
    });
    const caster = new RemoteCaster({ transport, settings: baseSettings });

    const onFailure = vi.fn();

    caster.cast(baseInput, { onAccepted: vi.fn(), onFailure });

    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(expectedNotice);
  });

  it('calls onFailure with 401 unauthorized notice', () => {
    const expectedNotice = mapPortalError({ kind: 'http', status: 401, body: '' }).notice;
    const transport = makeTransportStub((_input, cbs) => {
      cbs.onFailure(expectedNotice);
    });
    const caster = new RemoteCaster({ transport, settings: baseSettings });

    const onFailure = vi.fn();

    caster.cast(baseInput, { onAccepted: vi.fn(), onFailure });

    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(expectedNotice);
  });

  it('calls onFailure with non-2xx (500) notice', () => {
    const expectedNotice = mapPortalError({ kind: 'http', status: 500, body: '' }).notice;
    const transport = makeTransportStub((_input, cbs) => {
      cbs.onFailure(expectedNotice);
    });
    const caster = new RemoteCaster({ transport, settings: baseSettings });

    const onFailure = vi.fn();

    caster.cast(baseInput, { onAccepted: vi.fn(), onFailure });

    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(expectedNotice);
  });
});
