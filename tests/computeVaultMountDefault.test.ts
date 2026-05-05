import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App, Platform, FileSystemAdapter } from 'obsidian';
import { computeVaultMountDefault } from '../src/domain/settings/computeVaultMountDefault';

describe('computeVaultMountDefault', () => {
  let app: App;

  beforeEach(() => {
    Platform.isDesktop = true;
    app = new App();
  });

  afterEach(() => {
    Platform.isDesktop = true;
  });

  it('returns adapter.getBasePath() when Platform.isDesktop is true', () => {
    const adapter = new FileSystemAdapter();
    (app.vault as any).adapter = adapter;
    vi.mocked(adapter.getBasePath).mockReturnValue('/vault');

    const result = computeVaultMountDefault(app);

    expect(result).toBe('/vault');
    expect(adapter.getBasePath).toHaveBeenCalled();
  });

  it('returns empty string when Platform.isDesktop is false (adapter not consulted)', () => {
    Platform.isDesktop = false;
    const adapter = new FileSystemAdapter();
    (app.vault as any).adapter = adapter;
    vi.mocked(adapter.getBasePath).mockReturnValue('/vault');

    const result = computeVaultMountDefault(app);

    expect(result).toBe('');
    expect(adapter.getBasePath).not.toHaveBeenCalled();
  });

  it('returns empty string and logs error when getBasePath throws', () => {
    const adapter = new FileSystemAdapter();
    (app.vault as any).adapter = adapter;
    const error = new Error('boom');
    vi.mocked(adapter.getBasePath).mockImplementation(() => {
      throw error;
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = computeVaultMountDefault(app);

    expect(result).toBe('');
    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    consoleErrorSpy.mockRestore();
  });
});
