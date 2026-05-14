/* eslint-disable obsidianmd/prefer-active-doc */
// eslint-disable-next-line obsidianmd/no-nodejs-modules
import { stat as fsStat } from 'node:fs/promises';
import type { Vault, EventRef } from 'obsidian';
import type { RefreshCoordinator } from './RefreshCoordinator';

export interface VaultRefreshCoordinatorPorts {
  vault: Vault;
  watchedVaultPaths: readonly string[];
  watchedAbsPaths: readonly string[];
  pollIntervalMs: number;
  debounceMs: number;
  settlingWindowMs: number;
  stat?: (path: string) => Promise<{ mtimeMs: number }>;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class VaultRefreshCoordinator implements RefreshCoordinator {
  private readonly vault: Vault;
  private readonly watchedVaultPaths: readonly string[];
  private readonly watchedAbsPaths: readonly string[];
  private readonly pollIntervalMs: number;
  private readonly debounceMs: number;
  private readonly settlingWindowMs: number;
  private readonly stat: (path: string) => Promise<{ mtimeMs: number }>;
  private readonly _setInterval: typeof globalThis.setInterval;
  private readonly _clearInterval: typeof globalThis.clearInterval;
  private readonly _setTimeout: typeof globalThis.setTimeout;
  private readonly _clearTimeout: typeof globalThis.clearTimeout;

  private started = false;
  private disposed = false;
  private eventsObserved = false;
  private eventRef: EventRef | null = null;
  private lastStat = new Map<string, number>();
  private debounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  private settlingHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  private pollHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  private onRefresh: (() => void) | null = null;

  constructor(ports: VaultRefreshCoordinatorPorts) {
    this.vault = ports.vault;
    this.watchedVaultPaths = ports.watchedVaultPaths;
    this.watchedAbsPaths = ports.watchedAbsPaths;
    this.pollIntervalMs = ports.pollIntervalMs;
    this.debounceMs = ports.debounceMs;
    this.settlingWindowMs = ports.settlingWindowMs;
    this.stat = ports.stat ?? fsStat;
    this._setInterval = ports.setInterval ?? globalThis.setInterval;
    this._clearInterval = ports.clearInterval ?? globalThis.clearInterval;
    this._setTimeout = ports.setTimeout ?? globalThis.setTimeout;
    this._clearTimeout = ports.clearTimeout ?? globalThis.clearTimeout;
  }

  start(onRefresh: () => void): void {
    if (this.started) throw new Error('VaultRefreshCoordinator already started');
    this.started = true;
    this.disposed = false;
    this.eventsObserved = false;
    this.onRefresh = onRefresh;

    // Register vault modify handler — filter to watched paths
    this.eventRef = this.vault.on('modify', (file: { path: string }) => {
      if (this.watchedVaultPaths.includes(file.path)) {
        this.eventsObserved = true;
        this.scheduleRefresh();
      }
    });

    // Sample initial mtimes then schedule the settling window check
    void this.sampleBaseline().then(() => {
      this.scheduleSettlingWindow();
    });
  }

  stop(): void {
    this.disposed = true;
    this.started = false;

    if (this.eventRef !== null) {
      this.vault.offref(this.eventRef);
      this.eventRef = null;
    }

    if (this.debounceHandle !== null) {
      this._clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }

    if (this.settlingHandle !== null) {
      this._clearTimeout(this.settlingHandle);
      this.settlingHandle = null;
    }

    if (this.pollHandle !== null) {
      this._clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  // Trailing debounce — each call resets the timer window.
  private scheduleRefresh(): void {
    if (this.debounceHandle !== null) {
      this._clearTimeout(this.debounceHandle);
    }
    this.debounceHandle = this._setTimeout(() => {
      this.debounceHandle = null;
      if (!this.disposed && this.onRefresh) {
        try {
          this.onRefresh();
        } catch {
          // Callback error must not break the coordinator's subscription.
        }
      }
    }, this.debounceMs);
  }

  private async sampleBaseline(): Promise<void> {
    for (const absPath of this.watchedAbsPaths) {
      try {
        const { mtimeMs } = await this.stat(absPath);
        this.lastStat.set(absPath, mtimeMs);
      } catch (err) {
        console.error(`VaultRefreshCoordinator: failed to stat "${absPath}" during baseline:`, err);
        this.lastStat.set(absPath, 0);
      }
    }
  }

  private scheduleSettlingWindow(): void {
    if (this.watchedAbsPaths.length === 0 || this.disposed) return;

    this.settlingHandle = this._setTimeout(() => {
      this.settlingHandle = null;
      void this.checkSettlingWindow();
    }, this.settlingWindowMs);
  }

  private async checkSettlingWindow(): Promise<void> {
    if (this.disposed || this.eventsObserved) return;

    // Sample mtimes once to keep lastStat current — but don't gate poller
    // engagement on whether they changed. The settling window is a probe for
    // the vault-modify path; if no events were observed during it, the file
    // lives outside Obsidian's event surface (e.g. .obsidian/plugins/**) and
    // we must fall back to polling regardless of whether mtime moved during
    // that initial window.
    for (const absPath of this.watchedAbsPaths) {
      try {
        const { mtimeMs } = await this.stat(absPath);
        if (mtimeMs !== this.lastStat.get(absPath)) {
          this.lastStat.set(absPath, mtimeMs);
        }
      } catch {
        // Treat stat error as no change.
      }
    }

    if (!this.eventsObserved && !this.disposed) {
      this.engagePoller();
    }
  }

  private engagePoller(): void {
    if (this.pollHandle !== null || this.disposed) return;

    this.pollHandle = this._setInterval(() => {
      void this.pollMtimes();
    }, this.pollIntervalMs);
  }

  private async pollMtimes(): Promise<void> {
    if (this.disposed) return;

    let anyChanged = false;
    for (const absPath of this.watchedAbsPaths) {
      try {
        const { mtimeMs } = await this.stat(absPath);
        if (mtimeMs !== this.lastStat.get(absPath)) {
          anyChanged = true;
          this.lastStat.set(absPath, mtimeMs);
        }
      } catch {
        // Treat stat error as no change.
      }
    }

    if (anyChanged && !this.disposed) {
      this.scheduleRefresh();
    }
  }
}
