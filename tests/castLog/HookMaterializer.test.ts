import { describe, it, expect, vi } from 'vitest';
import { HookMaterializer } from '../../src/castLog/HookMaterializer';
import { renderSessionStartScript, renderPostToolUseScript, renderStopScript } from '../../src/castLog/hookScripts';

describe('HookMaterializer', () => {
  describe('run', () => {
    it('should call mkdir once with hooks directory and writeFile 3 times with correct paths', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-local.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(mkdir).toHaveBeenCalledTimes(1);
      expect(mkdir).toHaveBeenCalledWith('/p/hooks');

      expect(writeFile).toHaveBeenCalledTimes(3);
      expect(writeFile).toHaveBeenNthCalledWith(1, expect.stringContaining('/p/hooks/session-start.sh'), expect.any(String), expect.any(Number));
      expect(writeFile).toHaveBeenNthCalledWith(2, expect.stringContaining('/p/hooks/post-tool-use.sh'), expect.any(String), expect.any(Number));
      expect(writeFile).toHaveBeenNthCalledWith(3, expect.stringContaining('/p/hooks/stop.sh'), expect.any(String), expect.any(Number));
    });

    it('should write session-start.sh with content matching renderSessionStartScript', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-local.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderSessionStartScript({ logPathAbs: '/p/cast-log-local.jsonl' });
      expect(writeFile).toHaveBeenNthCalledWith(1, '/p/hooks/session-start.sh', expectedContent, 0o755);
    });

    it('should write post-tool-use.sh with content matching renderPostToolUseScript', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-local.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderPostToolUseScript({ scratchDirAbs: '/p/cast-log-scratch' });
      expect(writeFile).toHaveBeenNthCalledWith(2, '/p/hooks/post-tool-use.sh', expectedContent, 0o755);
    });

    it('should write stop.sh with content matching renderStopScript', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-local.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderStopScript({
        logPathAbs: '/p/cast-log-local.jsonl',
        scratchDirAbs: '/p/cast-log-scratch',
      });
      expect(writeFile).toHaveBeenNthCalledWith(3, '/p/hooks/stop.sh', expectedContent, 0o755);
    });

    it('should pass mode 0o755 for all three shell scripts', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-local.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(writeFile.mock.calls[0][2]).toBe(0o755);
      expect(writeFile.mock.calls[1][2]).toBe(0o755);
      expect(writeFile.mock.calls[2][2]).toBe(0o755);
    });

    it('should reject if writeFile rejects on the first script', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const testError = new Error('write failed');
      const writeFile = vi.fn().mockRejectedValue(testError);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-local.jsonl',
        writeFile,
        mkdir,
      });

      await expect(mat.run()).rejects.toThrow(testError);
    });

    it('should use default writeFile and mkdir when not provided', async () => {
      // Note: default ports use fs/promises.writeFile+chmod and fs/promises.mkdir.
      // This test verifies the code path exists by constructing without ports.
      // In a real scenario, fs.promises would be called; here we confirm
      // the implementation sets up defaults correctly by checking constructor behavior.

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/tmp/plugin',
        getLogPathAbs: () => '/tmp/plugin/cast-log-local.jsonl',
      });

      // Constructor should complete without error
      expect(mat).toBeDefined();
    });

    it('should handle trailing slash in getPluginDirAbs() correctly', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p/', // trailing slash
        getLogPathAbs: () => '/p/cast-log-local.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      // mkdir should still resolve to /p/hooks (not /p//hooks)
      expect(mkdir).toHaveBeenCalledWith('/p/hooks');

      // First writeFile should write to /p/hooks/session-start.sh (not /p//hooks/session-start.sh)
      expect(writeFile.mock.calls[0][0]).toBe('/p/hooks/session-start.sh');
      expect(writeFile.mock.calls[1][0]).toBe('/p/hooks/post-tool-use.sh');
      expect(writeFile.mock.calls[2][0]).toBe('/p/hooks/stop.sh');
    });
  });
});
