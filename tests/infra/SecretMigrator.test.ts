import { describe, it, expect, vi } from 'vitest';
import { PortalSecret, SecretStorageLike } from '../../src/infra/PortalSecret';
import { SecretMigrator, MigrationLegacyAccess } from '../../src/infra/SecretMigrator';

describe('SecretMigrator', () => {
  it('(a) legacy empty → returns skipped-empty, secret untouched, persist not called', async () => {
    // Setup: Map-backed fake secret storage
    const storage: SecretStorageLike = new Map() as any;
    storage.getSecret = (id: string) => (storage as any).get(id) ?? null;
    storage.setSecret = (id: string, value: string) => (storage as any).set(id, value);
    storage.listSecrets = () => Array.from((storage as any).keys());
    const secret = new PortalSecret({ secretStorage: storage });

    // Legacy access fake: mutable password object
    let legacyPassword = '';
    const legacy: MigrationLegacyAccess = {
      readLegacy: () => legacyPassword,
      clearLegacy: vi.fn(() => {
        legacyPassword = '';
      }),
      persist: vi.fn(async () => {}),
    };

    const migrator = new SecretMigrator({ secret, legacy });

    // Act
    const result = await migrator.run();

    // Assert
    expect(result).toBe('skipped-empty');
    expect(secret.get()).toBe('');
    expect(legacy.persist).not.toHaveBeenCalled();
  });

  it('(b) legacy non-empty + secret empty → returns migrated, secret set, legacy cleared', async () => {
    // Setup: Map-backed fake secret storage
    const storage: SecretStorageLike = new Map() as any;
    storage.getSecret = (id: string) => (storage as any).get(id) ?? null;
    storage.setSecret = (id: string, value: string) => (storage as any).set(id, value);
    storage.listSecrets = () => Array.from((storage as any).keys());
    const secret = new PortalSecret({ secretStorage: storage });

    // Legacy access fake
    let legacyPassword = 'myLegacyPassword';
    const legacy: MigrationLegacyAccess = {
      readLegacy: () => legacyPassword,
      clearLegacy: vi.fn(() => {
        legacyPassword = '';
      }),
      persist: vi.fn(async () => {}),
    };

    const migrator = new SecretMigrator({ secret, legacy });

    // Act
    const result = await migrator.run();

    // Assert
    expect(result).toBe('migrated');
    expect(secret.get()).toBe('myLegacyPassword');
    expect(legacy.clearLegacy).toHaveBeenCalled();
    expect(legacy.persist).toHaveBeenCalled();
  });

  it('(c) legacy non-empty + secret already non-empty → returns skipped-already-set, secret preserved', async () => {
    // Setup: Map-backed fake secret storage with pre-existing secret
    const storage: SecretStorageLike = new Map() as any;
    storage.getSecret = (id: string) => (storage as any).get(id) ?? null;
    storage.setSecret = (id: string, value: string) => (storage as any).set(id, value);
    storage.listSecrets = () => Array.from((storage as any).keys());
    const secret = new PortalSecret({ secretStorage: storage });
    secret.set('existingSecret');

    // Legacy access fake
    let legacyPassword = 'myLegacyPassword';
    const legacy: MigrationLegacyAccess = {
      readLegacy: () => legacyPassword,
      clearLegacy: vi.fn(() => {
        legacyPassword = '';
      }),
      persist: vi.fn(async () => {}),
    };

    const migrator = new SecretMigrator({ secret, legacy });

    // Act
    const result = await migrator.run();

    // Assert
    expect(result).toBe('skipped-already-set');
    expect(secret.get()).toBe('existingSecret'); // unchanged
    expect(legacy.clearLegacy).toHaveBeenCalled();
    expect(legacy.persist).toHaveBeenCalled();
  });

  it('(d) idempotency – second run on migrated state returns skipped-empty', async () => {
    // Setup: Map-backed fake secret storage
    const storage: SecretStorageLike = new Map() as any;
    storage.getSecret = (id: string) => (storage as any).get(id) ?? null;
    storage.setSecret = (id: string, value: string) => (storage as any).set(id, value);
    storage.listSecrets = () => Array.from((storage as any).keys());
    const secret = new PortalSecret({ secretStorage: storage });

    // Legacy access fake
    let legacyPassword = 'myLegacyPassword';
    const legacy: MigrationLegacyAccess = {
      readLegacy: () => legacyPassword,
      clearLegacy: vi.fn(() => {
        legacyPassword = '';
      }),
      persist: vi.fn(async () => {}),
    };

    const migrator = new SecretMigrator({ secret, legacy });

    // First run: should migrate
    const result1 = await migrator.run();
    expect(result1).toBe('migrated');
    expect(secret.get()).toBe('myLegacyPassword');

    // Reset mocks to check second call
    vi.clearAllMocks();

    // Second run: legacy is now empty (cleared by first run)
    const result2 = await migrator.run();
    expect(result2).toBe('skipped-empty');
    expect(secret.get()).toBe('myLegacyPassword'); // unchanged from first run
    expect(legacy.persist).not.toHaveBeenCalled(); // second run didn't call persist
  });

  it('(e) persist rejection propagates as rejected promise', async () => {
    // Setup: Map-backed fake secret storage
    const storage: SecretStorageLike = new Map() as any;
    storage.getSecret = (id: string) => (storage as any).get(id) ?? null;
    storage.setSecret = (id: string, value: string) => (storage as any).set(id, value);
    storage.listSecrets = () => Array.from((storage as any).keys());
    const secret = new PortalSecret({ secretStorage: storage });

    // Legacy access fake with a rejecting persist
    let legacyPassword = 'myLegacyPassword';
    const persistError = new Error('persist failed');
    const legacy: MigrationLegacyAccess = {
      readLegacy: () => legacyPassword,
      clearLegacy: vi.fn(() => {
        legacyPassword = '';
      }),
      persist: vi.fn(async () => {
        throw persistError;
      }),
    };

    const migrator = new SecretMigrator({ secret, legacy });

    // Act & Assert
    await expect(migrator.run()).rejects.toThrow('persist failed');
  });
});
