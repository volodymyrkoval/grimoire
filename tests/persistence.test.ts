import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { hydrate } from '../src/domain/settings/persistence';
import { DEFAULT_SETTINGS } from '../src/domain/settings/Settings';

vi.mock('../src/domain/settings/computeVaultMountDefault', () => ({
  computeVaultMountDefault: vi.fn(() => '/mocked/vault'),
}));

import { computeVaultMountDefault } from '../src/domain/settings/computeVaultMountDefault';

describe('persistence.hydrate', () => {
  let app: App;
  const mockComputeVault = computeVaultMountDefault as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = new App();
    vi.clearAllMocks();
  });

  it('(a) returns GrimoireData with defaults and computed vaultMountPath when passed undefined', () => {
    const result = hydrate(undefined, app);

    expect(result.settings.spellTag).toBe(DEFAULT_SETTINGS.spellTag);
    expect(result.settings.cliCommand).toBe(DEFAULT_SETTINGS.cliCommand);
    expect(result.settings.binaryPath).toBe(DEFAULT_SETTINGS.binaryPath);
    expect(result.settings.forgeOutputFolder).toBe(DEFAULT_SETTINGS.forgeOutputFolder);
    expect(result.settings.vaultMountPath).toBe('/mocked/vault');
    expect(result.settings.defaultModel).toBe(DEFAULT_SETTINGS.defaultModel);
    expect(result.settings.defaultEffort).toBe(DEFAULT_SETTINGS.defaultEffort);
    expect(result.spellOverrides).toEqual({});
    expect(mockComputeVault).toHaveBeenCalledOnce();
  });

  it('(b) merges partial settings over defaults', () => {
    const saved = { settings: { cliCommand: 'foo' } };
    const result = hydrate(saved, app);

    expect(result.settings.cliCommand).toBe('foo');
    expect(result.settings.spellTag).toBe(DEFAULT_SETTINGS.spellTag);
    expect(result.settings.binaryPath).toBe(DEFAULT_SETTINGS.binaryPath);
    expect(result.settings.forgeOutputFolder).toBe(DEFAULT_SETTINGS.forgeOutputFolder);
    expect(result.settings.defaultModel).toBe(DEFAULT_SETTINGS.defaultModel);
    expect(result.settings.defaultEffort).toBe(DEFAULT_SETTINGS.defaultEffort);
  });

  it('(c) calls computeVaultMountDefault when vaultMountPath is empty string', () => {
    const saved = { settings: { vaultMountPath: '' } };
    hydrate(saved, app);

    expect(mockComputeVault).toHaveBeenCalledOnce();
    expect(mockComputeVault).toHaveBeenCalledWith(app);
  });

  it('(d) does not call computeVaultMountDefault when vaultMountPath is already set', () => {
    const saved = { settings: { vaultMountPath: '/already/set' } };
    const result = hydrate(saved, app);

    expect(result.settings.vaultMountPath).toBe('/already/set');
    expect(mockComputeVault).not.toHaveBeenCalled();
  });

  it('(e) coerces invalid defaultEffort to medium', () => {
    const saved = { settings: { defaultEffort: 'banana' as any } };
    const result = hydrate(saved, app);

    expect(result.settings.defaultEffort).toBe('medium');
  });

  it('(f) preserves null defaultEffort without coercion', () => {
    const saved = { settings: { defaultEffort: null } };
    const result = hydrate(saved, app);

    expect(result.settings.defaultEffort).toBeNull();
  });

  it('(g) carries through spellOverrides unmodified', () => {
    const overrides = {
      'spell-1': { model: 'claude-opus-4-5', effort: 'xhigh' as const },
      'spell-2': { model: 'claude-haiku-4-5', effort: 'low' as const },
    };
    const saved = { spellOverrides: overrides };
    const result = hydrate(saved, app);

    expect(result.spellOverrides).toEqual(overrides);
  });
});
