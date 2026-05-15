import { describe, it, expect, vi } from 'vitest';
import { ForgeMaterializer } from '../../src/forge/ForgeMaterializer';
import { renderForgeSystemPrompt } from '../../src/forge/forgeTemplate';

describe('ForgeMaterializer', () => {
  describe('run', () => {
    it('should call mkdir once with plugin directory', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new ForgeMaterializer({
        getForgePathAbs: () => '.obsidian/plugins/grimoire/forge.md',
        getSettings: () => ({
          spellTag: 'tag1',
          forgeOutputFolder: 'Spells/Forge',
          vaultMountPath: '/vault',
        }),
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(mkdir).toHaveBeenCalledTimes(1);
      expect(mkdir).toHaveBeenCalledWith('.obsidian/plugins/grimoire');
    });

    it('should call writeFile once with forge file path', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new ForgeMaterializer({
        getForgePathAbs: () => '.obsidian/plugins/grimoire/forge.md',
        getSettings: () => ({
          spellTag: 'tag1',
          forgeOutputFolder: 'Spells/Forge',
          vaultMountPath: '/vault',
        }),
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFile).toHaveBeenCalledWith(
        '.obsidian/plugins/grimoire/forge.md',
        expect.any(String)
      );
    });

    it('should write content matching renderForgeSystemPrompt', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const settings = {
        spellTag: 'grimoire/forge',
        forgeOutputFolder: 'Spells/Forge',
        vaultMountPath: '/home/user/vault',
      };

      const mat = new ForgeMaterializer({
        getForgePathAbs: () => '.obsidian/plugins/grimoire/forge.md',
        getSettings: () => settings,
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderForgeSystemPrompt(settings);
      expect(writeFile).toHaveBeenCalledWith(
        '.obsidian/plugins/grimoire/forge.md',
        expectedContent
      );
    });

    it('should reject if writeFile rejects', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const testError = new Error('write failed');
      const writeFile = vi.fn().mockRejectedValue(testError);

      const mat = new ForgeMaterializer({
        getForgePathAbs: () => '.obsidian/plugins/grimoire/forge.md',
        getSettings: () => ({
          spellTag: 'tag1',
          forgeOutputFolder: 'Spells/Forge',
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

      const mat = new ForgeMaterializer({
        getForgePathAbs: () => '.obsidian/plugins/grimoire/forge.md',
        getSettings: () => ({
          spellTag: 'tag1',
          forgeOutputFolder: 'Spells/Forge',
          vaultMountPath: '/vault',
        }),
        adapter: mockAdapter,
      });

      await mat.run();

      expect(mockAdapter.mkdir).toHaveBeenCalledWith('.obsidian/plugins/grimoire');
      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.obsidian/plugins/grimoire/forge.md',
        expect.any(String)
      );
    });

    it('should throw when neither adapter nor writeFile/mkdir are provided', () => {
      expect(() => {
        new ForgeMaterializer({
          getForgePathAbs: () => '.obsidian/plugins/grimoire/forge.md',
          getSettings: () => ({
            spellTag: 'tag1',
            forgeOutputFolder: 'Spells/Forge',
            vaultMountPath: '/vault',
          }),
        });
      }).toThrow('ForgeMaterializer: provide either adapter or writeFile+mkdir ports');
    });

    it('should handle trailing slash in getForgePathAbs', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new ForgeMaterializer({
        getForgePathAbs: () => '.obsidian/plugins/grimoire/forge.md/', // trailing slash
        getSettings: () => ({
          spellTag: 'tag1',
          forgeOutputFolder: 'Spells/Forge',
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
        expect.stringContaining('forge.md'),
        expect.any(String)
      );
    });
  });
});
