import { PortalSecret } from './PortalSecret';

export interface MigrationLegacyAccess {
  /** Returns current legacy plaintext, or '' if absent. */
  readLegacy(): string;
  /** Clears the legacy plaintext field in memory. */
  clearLegacy(): void;
  /** Persists the cleared field to data.json (awaited). */
  persist(): Promise<void>;
}

/**
 * One-shot idempotent migration of portal auth password from data.json plaintext to app.secretStorage.
 *
 * Reads legacy plaintext (if any), writes it to secretStorage, clears the legacy field,
 * and persists. Handles the case where the secret is already set (clears stale plaintext).
 * Is idempotent: after a successful migration, the legacy field is empty, so re-running
 * `run()` returns 'skipped-empty'.
 */
export class SecretMigrator {
  readonly #secret: PortalSecret;
  readonly #legacy: MigrationLegacyAccess;

  constructor(deps: { secret: PortalSecret; legacy: MigrationLegacyAccess }) {
    this.#secret = deps.secret;
    this.#legacy = deps.legacy;
  }

  /** @returns 'migrated' | 'skipped-empty' | 'skipped-already-set' */
  async run(): Promise<'migrated' | 'skipped-empty' | 'skipped-already-set'> {
    const decision = this.#decide();
    switch (decision) {
      case 'skip-empty':
        return 'skipped-empty';
      case 'skip-already-set':
        return 'skipped-already-set';
      case 'clear-stale':
        await this.#clearStalePlaintext();
        return 'skipped-already-set';
      case 'migrate':
        await this.#performMigration(this.#legacy.readLegacy());
        return 'migrated';
    }
  }

  #decide(): 'migrate' | 'skip-empty' | 'skip-already-set' | 'clear-stale' {
    const legacy = this.#legacy.readLegacy();
    const secret = this.#secret.get();

    // If legacy is empty, nothing to migrate
    if (legacy === '') {
      return 'skip-empty';
    }

    // If secret is already set, don't overwrite it, but clear stale plaintext
    if (secret !== '') {
      return 'clear-stale';
    }

    // Legacy non-empty and secret empty: perform migration
    return 'migrate';
  }

  async #performMigration(legacy: string): Promise<void> {
    this.#secret.set(legacy);
    this.#legacy.clearLegacy();
    await this.#legacy.persist();
  }

  async #clearStalePlaintext(): Promise<void> {
    this.#legacy.clearLegacy();
    await this.#legacy.persist();
  }
}
