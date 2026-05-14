/**
 * Integration test: VaultRefreshCoordinator ↔ Vault seam.
 *
 * Seam: the boundary between VaultRefreshCoordinator (parent) and the Obsidian
 * Vault's modify event system. The vault is the real fake from the obsidian mock
 * (not re-mocked here). vi.useFakeTimers() controls debounce timing.
 *
 * RED until E1 (VaultRefreshCoordinator) lands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from 'obsidian';
// VaultRefreshCoordinator does not exist yet — this import causes the red.
import { VaultRefreshCoordinator } from '../../src/castLog/VaultRefreshCoordinator';

const WATCHED_PATH = 'cast-log.jsonl';
const UNWATCHED_PATH = 'unrelated-note.md';
const DEBOUNCE_MS = 200;

function makeCoordinator(vault: App['vault']) {
  return new VaultRefreshCoordinator({
    vault,
    watchedVaultPaths: [WATCHED_PATH],
    watchedAbsPaths: [],
    pollIntervalMs: 60_000,
    debounceMs: DEBOUNCE_MS,
    settlingWindowMs: 0,
  });
}

describe('VaultRefreshCoordinator — vault/modify seam', () => {
  let app: App;

  beforeEach(() => {
    vi.useFakeTimers();
    app = new App();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onRefresh once after debounceMs when a watched path is modified', () => {
    const coordinator = makeCoordinator(app.vault);
    const onRefresh = vi.fn();

    coordinator.start(onRefresh);
    (app.vault as any).__fireModify(WATCHED_PATH);

    // Before debounce settles — should not have fired yet
    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onRefresh when an unwatched path is modified', () => {
    const coordinator = makeCoordinator(app.vault);
    const onRefresh = vi.fn();

    coordinator.start(onRefresh);
    (app.vault as any).__fireModify(UNWATCHED_PATH);

    vi.advanceTimersByTime(DEBOUNCE_MS * 2);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('debounces rapid successive modifications — calls onRefresh only once', () => {
    const coordinator = makeCoordinator(app.vault);
    const onRefresh = vi.fn();

    coordinator.start(onRefresh);

    // Fire the watched path several times within the debounce window
    (app.vault as any).__fireModify(WATCHED_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    (app.vault as any).__fireModify(WATCHED_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    (app.vault as any).__fireModify(WATCHED_PATH);

    // Still within the debounce window of the last fire
    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('stop() unsubscribes from vault so subsequent modifications do not call onRefresh', () => {
    const coordinator = makeCoordinator(app.vault);
    const onRefresh = vi.fn();

    coordinator.start(onRefresh);
    coordinator.stop();

    // vault.offref should have been called with the ref returned by vault.on
    expect(app.vault.offref).toHaveBeenCalledTimes(1);

    // Firing modify after stop must not trigger the callback
    (app.vault as any).__fireModify(WATCHED_PATH);
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
