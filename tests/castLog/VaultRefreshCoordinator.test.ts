import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VaultRefreshCoordinator } from '../../src/castLog/VaultRefreshCoordinator';

// Minimal vault fake — same contract as the obsidian mock but self-contained for unit tests.
function makeVault() {
  const subscribers = new Map<object, (file: { path: string }) => void>();

  const vault = {
    on: vi.fn((event: string, cb: (file: { path: string }) => void): object => {
      const ref: object = {};
      if (event === 'modify') subscribers.set(ref, cb);
      return ref;
    }),
    offref: vi.fn((ref: object): void => {
      subscribers.delete(ref);
    }),
    fire(path: string): void {
      for (const cb of subscribers.values()) cb({ path });
    },
  };

  return vault;
}

const WATCHED_VAULT_PATH = 'plugins/grimoire/cast-log-plugin.jsonl';
const ABS_PATH = '/vault/plugins/grimoire/cast-log-plugin.jsonl';
const DEBOUNCE_MS = 50;
const SETTLING_MS = 3000;
const POLL_MS = 1500;

describe('VaultRefreshCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. Vault-modify path ──────────────────────────────────────────────────

  it('(1) fires onRefresh after debounceMs when a watched path is modified', () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
    });

    coord.start(onRefresh);
    vault.fire(WATCHED_VAULT_PATH);

    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('(2) does NOT fire onRefresh for an unwatched path', () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
    });

    coord.start(onRefresh);
    vault.fire('unrelated/path.md');

    vi.advanceTimersByTime(DEBOUNCE_MS * 4);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('(3) debounces rapid fires — calls onRefresh only once', () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
    });

    coord.start(onRefresh);

    vault.fire(WATCHED_VAULT_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    vault.fire(WATCHED_VAULT_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    vault.fire(WATCHED_VAULT_PATH);

    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ── 2. stop() ────────────────────────────────────────────────────────────

  it('(4) stop() calls vault.offref and suppresses subsequent modify fires', () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
    });

    coord.start(onRefresh);
    coord.stop();

    expect(vault.offref).toHaveBeenCalledTimes(1);

    vault.fire(WATCHED_VAULT_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS * 4);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('(5) stop() mid-debounce — the pending callback is suppressed (disposed guard)', () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
    });

    coord.start(onRefresh);
    vault.fire(WATCHED_VAULT_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    coord.stop();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  // ── 3. Mtime-poll fallback ────────────────────────────────────────────────
  // These tests use vi.advanceTimersByTimeAsync() which flushes Promise
  // microtasks between timer callbacks — required because the coordinator
  // uses async stat() calls inside timer callbacks.

  it('(6) after settling window: mtime changed and no events → poller engages, onRefresh fires', async () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    // Baseline: 1000; settling check: 2000 (triggers engagement);
    // poller tick 1: 3000 (changed from 2000 → fires onRefresh)
    const mtimes = [1000, 2000, 3000];
    let statCallCount = 0;
    const stat = vi.fn((_path: string) => {
      const mtime = mtimes[Math.min(statCallCount, mtimes.length - 1)];
      statCallCount++;
      return Promise.resolve({ mtimeMs: mtime });
    });

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [],
      watchedAbsPaths: [ABS_PATH],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
      stat,
    });

    coord.start(onRefresh);

    // Advance to settling window — advanceTimersByTimeAsync flushes Promises between ticks
    await vi.advanceTimersByTimeAsync(SETTLING_MS);
    // Settling check resolved → poller engaged (if mtime changed)

    // Advance one poller interval
    await vi.advanceTimersByTimeAsync(POLL_MS);
    // Poll stat resolved → scheduleRefresh called

    // Advance through the debounce window
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('(7) after settling window with no vault events: poller engages even when mtime unchanged', async () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    // mtime never changes — but the poller must still engage because no vault
    // events were observed during the settling window. This is the core
    // semantics of "settling window as a probe" — a silent vault-modify path
    // proves the file lives outside Obsidian's event surface (e.g. .obsidian/plugins/**),
    // so we must fall back to mtime polling regardless of whether mtime moved
    // during that initial window.
    const stat = vi.fn((_path: string) =>
      Promise.resolve({ mtimeMs: 1000 }) // always unchanged
    );

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [],
      watchedAbsPaths: [ABS_PATH],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
      stat,
    });

    coord.start(onRefresh);

    // Baseline sample (1) + settling window check (2) = 2 stat calls so far.
    await vi.advanceTimersByTimeAsync(SETTLING_MS);
    expect(stat).toHaveBeenCalledTimes(2);

    // If the poller engaged, it must tick at least 3 more times in 3 intervals.
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(stat.mock.calls.length).toBeGreaterThanOrEqual(5);

    // mtime never moved → onRefresh must not fire (poller engaged but quiet).
    expect(onRefresh).not.toHaveBeenCalled();

    coord.stop();
  });

  it('(8) vault event and poller tick both within debounce window — single onRefresh fires', async () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    // Baseline: 1000; settling: 2000 (engages poller); poller tick 1: 3000 (changed)
    const mtimes = [1000, 2000, 3000];
    let statCallCount = 0;
    const stat = vi.fn((_path: string) => {
      const mtime = mtimes[Math.min(statCallCount, mtimes.length - 1)];
      statCallCount++;
      return Promise.resolve({ mtimeMs: mtime });
    });

    // Use a very long debounce so that both the vault event and the poller tick
    // land within the same debounce window.
    const LONG_DEBOUNCE = 2000; // > POLL_MS (1500)

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [ABS_PATH],
      pollIntervalMs: POLL_MS,
      debounceMs: LONG_DEBOUNCE,
      settlingWindowMs: SETTLING_MS,
      stat,
    });

    coord.start(onRefresh);

    await vi.advanceTimersByTimeAsync(SETTLING_MS);
    // Poller engaged (mtime changed: 1000→2000)

    // Fire vault event → debounce started (resets to t + LONG_DEBOUNCE)
    vault.fire(WATCHED_VAULT_PATH);

    // Advance POLL_MS (< LONG_DEBOUNCE) → poller fires, stat changes → scheduleRefresh()
    // (resets the debounce, still within the LONG_DEBOUNCE window)
    await vi.advanceTimersByTimeAsync(POLL_MS);

    // Advance through the remaining debounce window (LONG_DEBOUNCE - POLL_MS is not enough;
    // the debounce was reset at POLL_MS, so we need LONG_DEBOUNCE more from here)
    await vi.advanceTimersByTimeAsync(LONG_DEBOUNCE);

    // Despite two triggers (vault event + poller), the shared debounce fires exactly once
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ── 4. Guard ─────────────────────────────────────────────────────────────

  it('(9) calling start() twice without stop() throws', () => {
    const vault = makeVault();

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
    });

    coord.start(() => {});

    expect(() => coord.start(() => {})).toThrow('VaultRefreshCoordinator already started');
  });

  // ── 5. E2 edge cases ─────────────────────────────────────────────────────

  it('(10a) stat error during initial sample → logs error via console.error with path', async () => {
    const vault = makeVault();
    const onRefresh = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const stat = vi.fn((_path: string) =>
      Promise.reject(new Error('EACCES: permission denied'))
    );

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [],
      watchedAbsPaths: [ABS_PATH],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
      stat,
    });

    coord.start(onRefresh);

    // Let the async sampleBaseline promise resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleError).toHaveBeenCalledOnce();
    const [msg] = consoleError.mock.calls[0];
    expect(msg).toContain(ABS_PATH);

    consoleError.mockRestore();
    coord.stop();
  });

  it('(10b) stat error during initial sample → coordinator remains functional (no throw)', async () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    // stat always rejects — coordinator must swallow the error
    const stat = vi.fn((_path: string) =>
      Promise.reject(new Error('EACCES: permission denied'))
    );

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [ABS_PATH],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
      stat,
    });

    // start() must not throw
    coord.start(onRefresh);

    await vi.advanceTimersByTimeAsync(SETTLING_MS);

    // vault.on was registered (coordinator is alive)
    expect(vault.on).toHaveBeenCalledTimes(1);

    // Vault-modify path still works despite stat failure
    vault.fire(WATCHED_VAULT_PATH);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('(11) onRefresh callback throws → coordinator does not unsubscribe', () => {
    const vault = makeVault();
    let fireCount = 0;

    const onRefresh = vi.fn(() => {
      fireCount++;
      if (fireCount === 1) throw new Error('callback blew up');
    });

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [WATCHED_VAULT_PATH],
      watchedAbsPaths: [],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
    });

    coord.start(onRefresh);

    // First fire — callback throws
    vault.fire(WATCHED_VAULT_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    // offref should NOT have been called — coordinator still subscribed
    expect(vault.offref).not.toHaveBeenCalled();

    // Second fire — should still work
    vault.fire(WATCHED_VAULT_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('(12) mtime poller detects no change → does not fire onRefresh', async () => {
    const vault = makeVault();
    const onRefresh = vi.fn();

    let statCallCount = 0;
    const stat = vi.fn((_path: string) => {
      statCallCount++;
      // First call: 1000; subsequent calls: 2000 (engages poller but then no further change)
      const mtime = statCallCount === 1 ? 1000 : 2000;
      return Promise.resolve({ mtimeMs: mtime });
    });

    const coord = new VaultRefreshCoordinator({
      vault: vault as any,
      watchedVaultPaths: [],
      watchedAbsPaths: [ABS_PATH],
      pollIntervalMs: POLL_MS,
      debounceMs: DEBOUNCE_MS,
      settlingWindowMs: SETTLING_MS,
      stat,
    });

    coord.start(onRefresh);

    // Settling window → stat returns 2000 (changed from 1000) → poller engaged, baseline = 2000
    await vi.advanceTimersByTimeAsync(SETTLING_MS);

    // Poller tick → stat returns 2000 (same as baseline) → no change → no onRefresh
    await vi.advanceTimersByTimeAsync(POLL_MS + DEBOUNCE_MS);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
