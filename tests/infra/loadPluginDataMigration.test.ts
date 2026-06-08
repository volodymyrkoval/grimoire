import { describe, it, expect, vi } from 'vitest';
import { PortalSecret, SecretStorageLike, PORTAL_AUTH_PASSWORD_SECRET_ID } from '../../src/infra/PortalSecret';
import { SecretMigrator } from '../../src/infra/SecretMigrator';

describe('loadPluginData migration wiring', () => {
  /**
   * Helper to create a fresh fake secretStorage (Map-backed).
   */
  function makeStore(): SecretStorageLike {
    const map = new Map<string, string>();
    return {
      getSecret: (id: string) => map.get(id) ?? null,
      setSecret: (id: string, secret: string) => { map.set(id, secret); },
      listSecrets: () => Array.from(map.keys()),
    };
  }

  it('(a) legacy non-empty → migrated: reads plaintext, writes to store, clears legacy, persists once', async () => {
    // Setup: create data object mimicking GrimoirePlugin.data shape
    const data = {
      settings: {
        portalAuthPassword: 'legacy-secret-value',
      },
    };

    // Create the fake saveData callback (mocks this.saveData(this.data))
    const saveData = vi.fn(async () => {});

    // Create the migration legacy access inline, exactly as #loadPluginData does
    const legacy = {
      readLegacy: () => data.settings.portalAuthPassword,
      clearLegacy: () => { data.settings.portalAuthPassword = ''; },
      persist: () => saveData(data),
    };

    // Create PortalSecret with fresh store
    const secret = new PortalSecret({ secretStorage: makeStore() });

    // Instantiate migrator
    const migrator = new SecretMigrator({ secret, legacy });

    // Act: run the migration
    const result = await migrator.run();

    // Assert: migration occurred
    expect(result).toBe('migrated');
    expect(data.settings.portalAuthPassword).toBe('');
    expect(secret.get()).toBe('legacy-secret-value');
    expect(saveData).toHaveBeenCalledOnce();
    expect(saveData).toHaveBeenCalledWith(data);
  });

  it('(b) second run is idempotent: returns skipped-empty, no additional persist call', async () => {
    // Setup: same data, now with cleared legacy field (as if first migration happened)
    const data = {
      settings: {
        portalAuthPassword: '',
      },
    };

    const saveData = vi.fn(async () => {});
    const legacy = {
      readLegacy: () => data.settings.portalAuthPassword,
      clearLegacy: () => { data.settings.portalAuthPassword = ''; },
      persist: () => saveData(data),
    };

    // Create store with the secret already set (from first run)
    const store = makeStore();
    store.setSecret(PORTAL_AUTH_PASSWORD_SECRET_ID, 'legacy-secret-value');
    const secret = new PortalSecret({ secretStorage: store });

    const migrator = new SecretMigrator({ secret, legacy });

    // Act
    const result = await migrator.run();

    // Assert
    expect(result).toBe('skipped-empty');
    expect(saveData).not.toHaveBeenCalled();
    expect(secret.get()).toBe('legacy-secret-value');
  });

  it('(c) legacy empty from the start: returns skipped-empty, persist not called', async () => {
    // Setup: data with no legacy password
    const data = {
      settings: {
        portalAuthPassword: '',
      },
    };

    const saveData = vi.fn(async () => {});
    const legacy = {
      readLegacy: () => data.settings.portalAuthPassword,
      clearLegacy: () => { data.settings.portalAuthPassword = ''; },
      persist: () => saveData(data),
    };

    const secret = new PortalSecret({ secretStorage: makeStore() });
    const migrator = new SecretMigrator({ secret, legacy });

    // Act
    const result = await migrator.run();

    // Assert
    expect(result).toBe('skipped-empty');
    expect(saveData).not.toHaveBeenCalled();
    expect(secret.get()).toBe('');
  });
});
