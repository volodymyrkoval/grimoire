import { Notice } from 'obsidian';

export const PORTAL_AUTH_PASSWORD_SECRET_ID = 'grimoire.portalAuthPassword';

export interface SecretStorageLike {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
  listSecrets(): string[];
}

/**
 * Thin adapter over Obsidian's secretStorage for the single portal-password secret.
 * Requires Obsidian >= 1.11.4 (minAppVersion in manifest.json).
 */
export class PortalSecret {
  readonly #storage: SecretStorageLike;

  constructor(deps: { secretStorage: SecretStorageLike }) {
    this.#storage = deps.secretStorage;
  }

  /** Returns the current secret value, or '' if unset. Never throws. */
  get(): string {
    try {
      return this.#storage.getSecret(PORTAL_AUTH_PASSWORD_SECRET_ID) ?? '';
    } catch {
      return '';
    }
  }

  /** Persists the secret via app.secretStorage. */
  set(value: string): void {
    try {
      this.#storage.setSecret(PORTAL_AUTH_PASSWORD_SECRET_ID, value);
    } catch (err) {
      console.warn(
        `PortalSecret.set() failed to persist password: ${err instanceof Error ? err.message : String(err)}`
      );
      new Notice('Portal: failed to save password — check the developer console.');
    }
  }
}
