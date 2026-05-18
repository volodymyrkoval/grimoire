import { describe, it, expect, vi } from 'vitest';
import { ForgeUpdateMaterializer } from '../../src/forge/ForgeUpdateMaterializer';
import { renderForgeUpdateSystemPrompt } from '../../src/forge/forgeUpdateTemplate';

describe('ForgeUpdateMaterializer', () => {
  describe('run', () => {
    it('should call mkdir once with plugin directory', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new ForgeUpdateMaterializer({
        getForgeUpdatePathAbs: () => '.obsidian/plugins/grimoire/forge-update.md',
        getSettings: () => ({
          vaultMountPath: '/vault',
        }),
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(mkdir).toHaveBeenCalledTimes(1);
      expect(mkdir).toHaveBeenCalledWith('.obsidian/plugins/grimoire');
    });

    it('should call writeFile once with forge-update file path', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new ForgeUpdateMaterializer({
        getForgeUpdatePathAbs: () => '.obsidian/plugins/grimoire/forge-update.md',
        getSettings: () => ({
          vaultMountPath: '/vault',
        }),
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFile).toHaveBeenCalledWith(
        '.obsidian/plugins/grimoire/forge-update.md',
        expect.any(String)
      );
    });

    it('should write content matching renderForgeUpdateSystemPrompt', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const settings = {
        vaultMountPath: '/home/user/vault',
      };

      const mat = new ForgeUpdateMaterializer({
        getForgeUpdatePathAbs: () => '.obsidian/plugins/grimoire/forge-update.md',
        getSettings: () => settings,
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderForgeUpdateSystemPrompt(settings);
      expect(writeFile).toHaveBeenCalledWith(
        '.obsidian/plugins/grimoire/forge-update.md',
        expectedContent
      );
    });

    it('should reject if writeFile rejects', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const testError = new Error('write failed');
      const writeFile = vi.fn().mockRejectedValue(testError);

      const mat = new ForgeUpdateMaterializer({
        getForgeUpdatePathAbs: () => '.obsidian/plugins/grimoire/forge-update.md',
        getSettings: () => ({
          vaultMountPath: '/vault',
        }),
        writeFile,
        mkdir,
      });

      await expect(mat.run()).rejects.toThrow(testError);
    });

    it('should use default writeFile and mkdir when adapter is provided', async () => {
      const mockAdapter = {
        read: vi.fn(),
        write: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn(),
        remove: vi.fn(),
        rename: vi.fn(),
        getFullPath: vi.fn(),
        path: '',
      };

      const mat = new ForgeUpdateMaterializer({
        getForgeUpdatePathAbs: () => '.obsidian/plugins/grimoire/forge-update.md',
        getSettings: () => ({
          vaultMountPath: '/vault',
        }),
        adapter: mockAdapter,
      });

      await mat.run();

      expect(mockAdapter.mkdir).toHaveBeenCalledWith('.obsidian/plugins/grimoire');
      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.obsidian/plugins/grimoire/forge-update.md',
        expect.any(String)
      );
    });

    it('should throw when neither adapter nor writeFile/mkdir are provided', () => {
      expect(() => {
        new ForgeUpdateMaterializer({
          getForgeUpdatePathAbs: () => '.obsidian/plugins/grimoire/forge-update.md',
          getSettings: () => ({
            vaultMountPath: '/vault',
          }),
        });
      }).toThrow('ForgeUpdateMaterializer: provide either adapter or writeFile+mkdir ports');
    });

    it('should handle trailing slash in getForgeUpdatePathAbs', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new ForgeUpdateMaterializer({
        getForgeUpdatePathAbs: () => '.obsidian/plugins/grimoire/forge-update.md/', // trailing slash
        getSettings: () => ({
          vaultMountPath: '/vault',
        }),
        writeFile,
        mkdir,
      });

      await mat.run();

      // normalizePath should clean up the trailing slash
      expect(mkdir).toHaveBeenCalledWith('.obsidian/plugins/grimoire');
      // writeFile should still be called with the normalized path
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('forge-update.md'),
        expect.any(String)
      );
    });
  });
});
