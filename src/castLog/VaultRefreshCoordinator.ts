import type { Vault, EventRef, DataAdapter } from 'obsidian';
import type { RefreshCoordinator } from './RefreshCoordinator';

export interface VaultRefreshCoordinatorPorts {
  vault: Vault;
  watchedVaultPaths: readonly string[];
  watchedAbsPaths: readonly string[];
  pollIntervalMs: number;
  debounceMs: number;
  settlingWindowMs: number;
  stat?: (path: string) => Promise<{ mtimeMs: number }>;
  setInterval?: typeof activeWindow.setInterval;
  clearInterval?: typeof activeWindow.clearInterval;
  setTimeout?: typeof activeWindow.setTimeout;
  clearTimeout?: typeof activeWindow.clearTimeout;
  adapter?: DataAdapter;
}

export class VaultRefreshCoordinator implements RefreshCoordinator {
  readonly #vault: Vault;
  readonly #watchedVaultPaths: readonly string[];
  readonly #watchedAbsPaths: readonly string[];
  readonly #pollIntervalMs: number;
  readonly #debounceMs: number;
  readonly #settlingWindowMs: number;
  readonly #stat: (path: string) => Promise<{ mtimeMs: number }>;
  readonly #setInterval: typeof activeWindow.setInterval;
  readonly #clearInterval: typeof activeWindow.clearInterval;
  readonly #setTimeout: typeof activeWindow.setTimeout;
  readonly #clearTimeout: typeof activeWindow.clearTimeout;

  #started = false;
  #disposed = false;
  #eventsObserved = false;
  #eventRef: EventRef | null = null;
  #lastStat = new Map<string, number>();
  #debounceHandle: ReturnType<typeof activeWindow.setTimeout> | null = null;
  #settlingHandle: ReturnType<typeof activeWindow.setTimeout> | null = null;
  #pollHandle: ReturnType<typeof activeWindow.setInterval> | null = null;
  #onRefresh: (() => void) | null = null;

  constructor(ports: VaultRefreshCoordinatorPorts) {
    this.#vault = ports.vault;
    this.#watchedVaultPaths = ports.watchedVaultPaths;
    this.#watchedAbsPaths = ports.watchedAbsPaths;
    this.#pollIntervalMs = ports.pollIntervalMs;
    this.#debounceMs = ports.debounceMs;
    this.#settlingWindowMs = ports.settlingWindowMs;
    const adapter = ports.adapter;
    this.#stat = ports.stat ?? (async (filePath) => {
      const s = await adapter!.stat(filePath);
      if (!s) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      return { mtimeMs: s.mtime };
    });
    this.#setInterval = (ports.setInterval ?? activeWindow.setInterval.bind(activeWindow)) as typeof activeWindow.setInterval;
    this.#clearInterval = (ports.clearInterval ?? activeWindow.clearInterval.bind(activeWindow)) as typeof activeWindow.clearInterval;
    this.#setTimeout = (ports.setTimeout ?? activeWindow.setTimeout.bind(activeWindow)) as typeof activeWindow.setTimeout;
    this.#clearTimeout = (ports.clearTimeout ?? activeWindow.clearTimeout.bind(activeWindow)) as typeof activeWindow.clearTimeout;
  }

  start(onRefresh: () => void): void {
    if (this.#started) throw new Error('VaultRefreshCoordinator already started');
    this.#started = true;
    this.#disposed = false;
    this.#eventsObserved = false;
    this.#onRefresh = onRefresh;

    // Register vault modify handler — filter to watched paths
    this.#eventRef = this.#vault.on('modify', (file: { path: string }) => {
      if (this.#watchedVaultPaths.includes(file.path)) {
        this.#eventsObserved = true;
        this.#scheduleRefresh();
      }
    });

    // Sample initial mtimes then schedule the settling window check
    void this.#sampleBaseline().then(() => {
      this.#scheduleSettlingWindow();
    });
  }

  stop(): void {
    this.#disposed = true;
    this.#started = false;

    if (this.#eventRef !== null) {
      this.#vault.offref(this.#eventRef);
      this.#eventRef = null;
    }

    if (this.#debounceHandle !== null) {
      this.#clearTimeout(this.#debounceHandle);
      this.#debounceHandle = null;
    }

    if (this.#settlingHandle !== null) {
      this.#clearTimeout(this.#settlingHandle);
      this.#settlingHandle = null;
    }

    if (this.#pollHandle !== null) {
      this.#clearInterval(this.#pollHandle);
      this.#pollHandle = null;
    }
  }

  // Trailing debounce — each call resets the timer window.
  #scheduleRefresh(): void {
    if (this.#debounceHandle !== null) {
      this.#clearTimeout(this.#debounceHandle);
    }
    this.#debounceHandle = this.#setTimeout(() => {
      this.#debounceHandle = null;
      if (!this.#disposed && this.#onRefresh) {
        try {
          this.#onRefresh();
        } catch {
          // Callback error must not break the coordinator's subscription.
        }
      }
    }, this.#debounceMs);
  }

  async #sampleBaseline(): Promise<void> {
    for (const absPath of this.#watchedAbsPaths) {
      try {
        const { mtimeMs } = await this.#stat(absPath);
        this.#lastStat.set(absPath, mtimeMs);
      } catch (err) {
        if ((err as { code?: string }).code !== 'ENOENT') {
          console.error(`VaultRefreshCoordinator: failed to stat "${absPath}" during baseline:`, err);
        }
        this.#lastStat.set(absPath, 0);
      }
    }
  }

  #scheduleSettlingWindow(): void {
    if (this.#watchedAbsPaths.length === 0 || this.#disposed) return;

    this.#settlingHandle = this.#setTimeout(() => {
      this.#settlingHandle = null;
      void this.#checkSettlingWindow();
    }, this.#settlingWindowMs);
  }

  async #checkSettlingWindow(): Promise<void> {
    if (this.#disposed || this.#eventsObserved) return;

    // Sample mtimes once to keep lastStat current — but don't gate poller
    // engagement on whether they changed. The settling window is a probe for
    // the vault-modify path; if no events were observed during it, the file
    // lives outside Obsidian's event surface (e.g. .obsidian/plugins/**) and
    // we must fall back to polling regardless of whether mtime moved during
    // that initial window.
    for (const absPath of this.#watchedAbsPaths) {
      try {
        const { mtimeMs } = await this.#stat(absPath);
        if (mtimeMs !== this.#lastStat.get(absPath)) {
          this.#lastStat.set(absPath, mtimeMs);
        }
      } catch {
        // Treat stat error as no change.
      }
    }

    if (!this.#eventsObserved && !this.#disposed) {
      this.#engagePoller();
    }
  }

  #engagePoller(): void {
    if (this.#pollHandle !== null || this.#disposed) return;

    this.#pollHandle = this.#setInterval(() => {
      void this.#pollMtimes();
    }, this.#pollIntervalMs);
  }

  async #pollMtimes(): Promise<void> {
    if (this.#disposed) return;

    let anyChanged = false;
    for (const absPath of this.#watchedAbsPaths) {
      try {
        const { mtimeMs } = await this.#stat(absPath);
        if (mtimeMs !== this.#lastStat.get(absPath)) {
          anyChanged = true;
          this.#lastStat.set(absPath, mtimeMs);
        }
      } catch {
        // Treat stat error as no change.
      }
    }

    if (anyChanged && !this.#disposed) {
      this.#scheduleRefresh();
    }
  }
}
