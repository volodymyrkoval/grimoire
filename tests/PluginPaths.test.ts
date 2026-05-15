import { describe, it, expect } from 'vitest';
import { normalizePath } from 'obsidian';
import { PluginPaths } from '../src/infra/PluginPaths';

describe('PluginPaths', () => {
  it('pluginDirAbs returns normalized plugin directory', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(pluginDir);
    expect(paths.pluginDirAbs()).toBe(expected);
  });

  it('localLogPath returns normalized path to local cast log', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/cast-log-local.jsonl`);
    expect(paths.localLogPath()).toBe(expected);
  });

  it('remoteLogPath returns normalized path to remote cast log', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/cast-log-remote.jsonl`);
    expect(paths.remoteLogPath()).toBe(expected);
  });

  it('scratchDir returns normalized path to scratch directory', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/cast-log-scratch`);
    expect(paths.scratchDir()).toBe(expected);
  });
});
