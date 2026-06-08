import { describe, it, expect } from 'vitest';
import { PortalSecret, SecretStorageLike } from '../../src/infra/PortalSecret';
import { Notice } from 'obsidian';

describe('PortalSecret', () => {
  it('(a) get() returns empty string when key is absent', () => {
    const storage: SecretStorageLike = {
      getSecret: () => null,
      setSecret: () => {},
      listSecrets: () => [],
    };
    const secret = new PortalSecret({ secretStorage: storage });

    expect(secret.get()).toBe('');
  });

  it('(b) set(value) then get() returns the value', () => {
    const storage: SecretStorageLike = new Map() as any;
    storage.getSecret = (id: string) => (storage as any).get(id) ?? null;
    storage.setSecret = (id: string, value: string) => (storage as any).set(id, value);
    storage.listSecrets = () => Array.from((storage as any).keys());

    const secret = new PortalSecret({ secretStorage: storage });

    secret.set('myPassword');
    expect(secret.get()).toBe('myPassword');
  });

  it('(c) set() swallows thrown setSecret; get() after failed set returns previous value', () => {
    let storedValue = 'previousPassword';
    const storage: SecretStorageLike = {
      getSecret: () => storedValue,
      setSecret: () => {
        throw new Error('storage unavailable');
      },
      listSecrets: () => [],
    };
    const secret = new PortalSecret({ secretStorage: storage });

    // get() before set: returns the stored value
    expect(secret.get()).toBe('previousPassword');

    // set() throws but doesn't rethrow
    secret.set('newPassword');

    // get() still returns the previous value from storage
    expect(secret.get()).toBe('previousPassword');
  });

  it('(d) get() wraps thrown getSecret and returns empty string', () => {
    const storage: SecretStorageLike = {
      getSecret: () => {
        throw new Error('storage unavailable');
      },
      setSecret: () => {},
      listSecrets: () => [],
    };
    const secret = new PortalSecret({ secretStorage: storage });

    expect(secret.get()).toBe('');
  });

  it('(e) shows a Notice when setSecret throws', () => {
    const throwingStore: SecretStorageLike = {
      getSecret: () => null,
      setSecret: () => {
        throw new Error('storage failure');
      },
      listSecrets: () => [],
    };
    const secret = new PortalSecret({ secretStorage: throwingStore });

    // Clear existing notices
    Notice.instances = [];

    secret.set('test-password');

    expect(Notice.instances).toHaveLength(1);
    expect(Notice.instances[0].message).toContain('failed to save password');
  });
});
