import { describe, it, expect, vi } from 'vitest';
import { ScratchSweeper } from '../../src/castLog/ScratchSweeper';

describe('ScratchSweeper', () => {
  it('should delete old files and keep young files', async () => {
    const unlinkFn = vi.fn().mockResolvedValue(undefined);
    const ttlMs = 24 * 60 * 60 * 1000;
    const now = 1_000_000;
    const statFn = vi.fn((filePath: string) => {
      if (filePath.includes('old')) {
        // old.paths: mtime is old enough that now - mtimeMs > ttlMs
        return Promise.resolve({ mtimeMs: now - ttlMs - 1 });
      }
      // young.paths: mtime is recent enough that now - mtimeMs <= ttlMs
      return Promise.resolve({ mtimeMs: now - 60 * 60 * 1000 });
    });
    const readdirFn = vi.fn().mockResolvedValue(['/scratch/old.paths', '/scratch/young.paths']);

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => '/scratch',
      readdir: readdirFn,
      stat: statFn,
      unlink: unlinkFn,
      now: () => now,
      ttlMs: ttlMs,
    });

    await sweeper.sweep();

    expect(unlinkFn).toHaveBeenCalledTimes(1);
    expect(unlinkFn).toHaveBeenCalledWith('/scratch/old.paths');
  });

  it('should resolve without error when readdir throws ENOENT', async () => {
    const unlinkFn = vi.fn().mockResolvedValue(undefined);
    const error = new Error('ENOENT');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    const readdirFn = vi.fn().mockRejectedValue(error);

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => '/scratch',
      readdir: readdirFn,
      unlink: unlinkFn,
      now: () => 1_000_000,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    await sweeper.sweep();

    expect(unlinkFn).not.toHaveBeenCalled();
  });

  it('should continue to next file when unlink fails on one file', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ttlMs = 24 * 60 * 60 * 1000;
    const now = 1_000_000;

    // Both files are old enough to delete
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: now - ttlMs - 1 });

    // unlink fails on first call, succeeds on second
    const unlinkError = new Error('EACCES');
    const unlinkFn = vi
      .fn()
      .mockRejectedValueOnce(unlinkError)
      .mockResolvedValueOnce(undefined);

    const readdirFn = vi.fn().mockResolvedValue(['/scratch/file1.paths', '/scratch/file2.paths']);

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => '/scratch',
      readdir: readdirFn,
      stat: statFn,
      unlink: unlinkFn,
      now: () => now,
      ttlMs: ttlMs,
    });

    await sweeper.sweep();

    // Both files should have been attempted for deletion
    expect(unlinkFn).toHaveBeenCalledTimes(2);
    expect(unlinkFn).toHaveBeenNthCalledWith(1, '/scratch/file1.paths');
    expect(unlinkFn).toHaveBeenNthCalledWith(2, '/scratch/file2.paths');

    // Error should have been logged
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should not call stat or unlink when directory is empty', async () => {
    const statFn = vi.fn();
    const unlinkFn = vi.fn();
    const readdirFn = vi.fn().mockResolvedValue([]);

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => '/scratch',
      readdir: readdirFn,
      stat: statFn,
      unlink: unlinkFn,
      now: () => 1_000_000,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    await sweeper.sweep();

    expect(statFn).not.toHaveBeenCalled();
    expect(unlinkFn).not.toHaveBeenCalled();
  });

  it('should not delete file exactly at boundary (now - mtimeMs === ttlMs)', async () => {
    const ttlMs = 24 * 60 * 60 * 1000;
    const now = 1_000_000;
    const unlinkFn = vi.fn().mockResolvedValue(undefined);
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: now - ttlMs });
    const readdirFn = vi.fn().mockResolvedValue(['/scratch/boundary.paths']);

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => '/scratch',
      readdir: readdirFn,
      stat: statFn,
      unlink: unlinkFn,
      now: () => now,
      ttlMs: ttlMs,
    });

    await sweeper.sweep();

    expect(unlinkFn).not.toHaveBeenCalled();
  });

  it('continues sweeping remaining files when stat() rejects for one file', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ttlMs = 24 * 60 * 60 * 1000;
    const now = 1_000_000;

    const statError = new Error('ENOENT: stat failed');
    const statFn = vi
      .fn()
      .mockRejectedValueOnce(statError)
      .mockResolvedValueOnce({ mtimeMs: now - ttlMs - 1 });

    const unlinkFn = vi.fn().mockResolvedValue(undefined);
    const readdirFn = vi.fn().mockResolvedValue(['/scratch/file1.paths', '/scratch/file2.paths']);

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => '/scratch',
      readdir: readdirFn,
      stat: statFn,
      unlink: unlinkFn,
      now: () => now,
      ttlMs: ttlMs,
    });

    await sweeper.sweep();

    expect(unlinkFn).toHaveBeenCalledTimes(1);
    expect(unlinkFn).toHaveBeenCalledWith('/scratch/file2.paths');

    consoleErrorSpy.mockRestore();
  });

  it('should delete file just past boundary (now - mtimeMs === ttlMs + 1)', async () => {
    const ttlMs = 24 * 60 * 60 * 1000;
    const now = 1_000_000;
    const unlinkFn = vi.fn().mockResolvedValue(undefined);
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: now - ttlMs - 1 });
    const readdirFn = vi.fn().mockResolvedValue(['/scratch/past.paths']);

    const sweeper = new ScratchSweeper({
      getScratchDirAbs: () => '/scratch',
      readdir: readdirFn,
      stat: statFn,
      unlink: unlinkFn,
      now: () => now,
      ttlMs: ttlMs,
    });

    await sweeper.sweep();

    expect(unlinkFn).toHaveBeenCalledTimes(1);
    expect(unlinkFn).toHaveBeenCalledWith('/scratch/past.paths');
  });
});
