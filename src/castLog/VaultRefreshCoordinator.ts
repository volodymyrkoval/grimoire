import type { Vault, EventRef, DataAdapter } from 'obsidian';
import type { RefreshCoordinator } from './RefreshCoordinator';

/**
 * Obsidian vault operations and timer functions for VaultRefreshCoordinator.
 * Defaults to Obsidian's Vault and activeWindow timers if not provided.
 */
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

/**
 * Detects cast log file changes via Obsidian's vault.on('modify') event, with fallback polling.
 * Strategy: listen to vault events for watched vault paths; if no events fire during a settling window,
 * engage a poller for watched absolute paths (e.g., files outside the vault like .obsidian/plugins/**).
 * Uses trailing debounce to suppress redundant callbacks within a debounce window.
 */
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

  /**
   * Starts monitoring: subscribe to vault events, sample baselines, and schedule settling window.
   * Throws if already started.
   */
  start(onRefresh: () => void): void {
    if (this.#started) throw new Error('VaultRefreshCoordinator already started');
    this.#started = true;
    this.#disposed = false;
    this.#eventsObserved = false;
    this.#onRefresh = onRefresh;

    this.#eventRef = this.#vault.on('modify', (file: { path: string }) => {
      if (this.#watchedVaultPaths.includes(file.path)) {
        this.#eventsObserved = true;
        this.#scheduleRefresh();
      }
    });

    void this.#sampleBaseline().then(() => {
      this.#scheduleSettlingWindow();
    });
  }

  /**
   * Stops monitoring: clears vault subscription and all timers.
   */
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

  /**
   * Schedules a trailing debounced refresh callback.
   * Each call resets the timer window; callback fires once after debounceMs of quiet.
   */
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

  /**
   * Reads initial modification times for all watched absolute paths.
   * Treats stat errors as "no baseline" (0) to ensure poller engages.
   */
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

  /**
   * Schedules the settling window check: a probe to detect if vault-modify events fire.
   */
  #scheduleSettlingWindow(): void {
    if (this.#watchedAbsPaths.length === 0 || this.#disposed) return;

    this.#settlingHandle = this.#setTimeout(() => {
      this.#settlingHandle = null;
      void this.#checkSettlingWindow();
    }, this.#settlingWindowMs);
  }

  /**
   * Checks if vault events were observed during the settling window.
   * If not, engages the poller for files outside Obsidian's event surface (e.g., .obsidian/plugins/**).
   * Updates mtimes regardless to keep baseline current.
   */
  async #checkSettlingWindow(): Promise<void> {
    if (this.#disposed || this.#eventsObserved) return;

    for (const absPath of this.#watchedAbsPaths) {
      try {
        const { mtimeMs } = await this.#stat(absPath);
        if (mtimeMs !== this.#lastStat.get(absPath)) {
          this.#lastStat.set(absPath, mtimeMs);
        }
      } catch {
        // File may no longer exist; treat as no change.
      }
    }

    if (!this.#eventsObserved && !this.#disposed) {
      this.#engagePoller();
    }
  }

  /**
   * Starts the polling timer for periodic mtime checks.
   */
  #engagePoller(): void {
    if (this.#pollHandle !== null || this.#disposed) return;

    this.#pollHandle = this.#setInterval(() => {
      void this.#pollMtimes();
    }, this.#pollIntervalMs);
  }

  /**
   * Polls watched absolute paths for mtime changes; schedules a debounced refresh if any changed.
   */
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
        // File may no longer exist; treat as no change.
      }
    }

    if (anyChanged && !this.#disposed) {
      this.#scheduleRefresh();
    }
  }
}
