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

  it('pluginLogPath returns normalized path to local cast log', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/cast-log-plugin.jsonl`);
    expect(paths.pluginLogPath()).toBe(expected);
  });

  it('agentLogPath returns normalized path to remote cast log', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/cast-log-agent.jsonl`);
    expect(paths.agentLogPath()).toBe(expected);
  });

  it('scratchDir returns normalized path to scratch directory', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/cast-log-scratch`);
    expect(paths.scratchDir()).toBe(expected);
  });

  it('agentHooksDirAbs returns normalized path to agent-hooks subdirectory', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/agent-hooks`);
    expect(paths.agentHooksDirAbs()).toBe(expected);
  });

  it('forgeSpellPathPluginRel returns normalized path to forge.md file', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/forge.md`);
    expect(paths.forgeSpellPathPluginRel()).toBe(expected);
  });

  it('forgeSpellPathVaultRel returns vault-relative forge.md path', () => {
    const pluginDir = '.obsidian/plugins/grimoire';
    const paths = new PluginPaths(pluginDir);
    const expected = normalizePath(`${pluginDir}/forge.md`);
    expect(paths.forgeSpellPathVaultRel()).toBe(expected);
  });
});
