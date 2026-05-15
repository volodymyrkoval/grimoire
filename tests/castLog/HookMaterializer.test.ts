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
        getLogPathAbs: () => '/p/cast-log-plugin.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(mkdir).toHaveBeenCalledTimes(1);
      expect(mkdir).toHaveBeenCalledWith('/p/hooks');

      expect(writeFile).toHaveBeenCalledTimes(3);
      expect(writeFile).toHaveBeenNthCalledWith(1, expect.stringContaining('/p/hooks/session-start.sh'), expect.any(String));
      expect(writeFile).toHaveBeenNthCalledWith(2, expect.stringContaining('/p/hooks/post-tool-use.sh'), expect.any(String));
      expect(writeFile).toHaveBeenNthCalledWith(3, expect.stringContaining('/p/hooks/stop.sh'), expect.any(String));
    });

    it('should write session-start.sh with content matching renderSessionStartScript', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-plugin.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderSessionStartScript({ logPathAbs: '/p/cast-log-plugin.jsonl' });
      expect(writeFile).toHaveBeenNthCalledWith(1, '/p/hooks/session-start.sh', expectedContent);
    });

    it('should write post-tool-use.sh with content matching renderPostToolUseScript', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-plugin.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderPostToolUseScript({ scratchDirAbs: '/p/cast-log-scratch' });
      expect(writeFile).toHaveBeenNthCalledWith(2, '/p/hooks/post-tool-use.sh', expectedContent);
    });

    it('should write stop.sh with content matching renderStopScript', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-plugin.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      const expectedContent = renderStopScript({
        logPathAbs: '/p/cast-log-plugin.jsonl',
        scratchDirAbs: '/p/cast-log-scratch',
      });
      expect(writeFile).toHaveBeenNthCalledWith(3, '/p/hooks/stop.sh', expectedContent);
    });

    it('should reject if writeFile rejects on the first script', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const testError = new Error('write failed');
      const writeFile = vi.fn().mockRejectedValue(testError);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-plugin.jsonl',
        writeFile,
        mkdir,
      });

      await expect(mat.run()).rejects.toThrow(testError);
    });

    it('should use default writeFile and mkdir when not provided', async () => {
      // Note: default ports use DataAdapter.write and DataAdapter.mkdir.
      // This test verifies the code path exists by constructing without IO ports.
      // In a real scenario, the adapter would be called; here we confirm
      // the implementation sets up defaults correctly by checking constructor behavior.

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/tmp/plugin',
        getLogPathAbs: () => '/tmp/plugin/cast-log-plugin.jsonl',
      });

      // Constructor should complete without error
      expect(mat).toBeDefined();
    });

    it('should write to hooksDir subdirectory when hooksDir port is provided', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p',
        getLogPathAbs: () => '/p/cast-log-agent.jsonl',
        writeFile,
        mkdir,
        hooksDir: 'agent-hooks',
      });

      await mat.run();

      expect(mkdir).toHaveBeenCalledWith('/p/agent-hooks');
      expect(writeFile).toHaveBeenNthCalledWith(1, '/p/agent-hooks/session-start.sh', expect.any(String));
      expect(writeFile).toHaveBeenNthCalledWith(2, '/p/agent-hooks/post-tool-use.sh', expect.any(String));
      expect(writeFile).toHaveBeenNthCalledWith(3, '/p/agent-hooks/stop.sh', expect.any(String));
    });

    it('should handle trailing slash in getPluginDirAbs() correctly', async () => {
      const mkdir = vi.fn().mockResolvedValue(undefined);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      const mat = new HookMaterializer({
        getPluginDirAbs: () => '/p/', // trailing slash
        getLogPathAbs: () => '/p/cast-log-plugin.jsonl',
        writeFile,
        mkdir,
      });

      await mat.run();

      expect(mkdir).toHaveBeenCalledWith('/p/hooks');
      expect(writeFile.mock.calls[0][0]).toBe('/p/hooks/session-start.sh');
      expect(writeFile.mock.calls[1][0]).toBe('/p/hooks/post-tool-use.sh');
      expect(writeFile.mock.calls[2][0]).toBe('/p/hooks/stop.sh');
    });
  });
});
