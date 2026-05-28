import { describe, it, expect } from 'vitest';
import { buildCastArgs } from '../src/cast/local/buildCastArgs';

describe('buildCastArgs', () => {
  it('builds inline mode args with metaSpell', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell content',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '',
    });
    expect(args).toEqual([
      '-p',
      'my spell content',
      '--model',
      'claude-sonnet-4-5',
      '--permission-mode',
      'dontAsk',
    ]);
  });

  it('builds file mode args with systemPromptFile and userPrompt', () => {
    const args = buildCastArgs({
      systemPromptFile: '/path/to/sys.md',
      userPrompt: 'do the thing',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '',
    });
    expect(args).toEqual([
      '--system-prompt-file',
      '/path/to/sys.md',
      '-p',
      'do the thing',
      '--model',
      'claude-sonnet-4-5',
      '--permission-mode',
      'dontAsk',
    ]);
  });

  it('includes effort when effort is not null', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-sonnet-4-5',
      effort: 'high',
      vaultMountPath: '',
      mcpConfigPath: '',
    });
    expect(args).toContain('--effort');
    expect(args).toContain('high');
  });

  it('omits effort flag when effort is null', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '',
    });
    expect(args).not.toContain('--effort');
  });

  it('includes --add-dir when vaultMountPath is non-empty', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '/vault/mount',
      mcpConfigPath: '',
    });
    expect(args).toContain('--add-dir');
    expect(args).toContain('/vault/mount');
  });

  it('omits --add-dir when vaultMountPath is empty', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '',
    });
    expect(args).not.toContain('--add-dir');
  });

  it('combines effort and vaultMountPath flags', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-opus-4-5',
      effort: 'xhigh',
      vaultMountPath: '/vault',
      mcpConfigPath: '',
    });
    expect(args).toContain('--effort');
    expect(args).toContain('xhigh');
    expect(args).toContain('--add-dir');
    expect(args).toContain('/vault');
  });

  it('forge-shaped: systemPromptFile is forge.md, userPrompt is small per-cast block', () => {
    // Regression guard: after forge-spell-materialization refactor, forge casts
    // pass systemPromptFile pointing at the vault-relative forge.md path, with a small
    // per-cast userPrompt. This test asserts the argv order is correct:
    // --system-prompt-file <path> -p <block>  (not reversed or mangled).
    const forgePath = '/vault/.obsidian/plugins/grimoire/forge.md';
    const forgeUserPrompt =
      'name: My Spell\ndescription: Does things\nmodel: claude-sonnet-4-5\neffort: medium\nexecuteOnNote: false';

    const args = buildCastArgs({
      systemPromptFile: forgePath,
      userPrompt: forgeUserPrompt,
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '/vault',
      mcpConfigPath: '',
    });

    // Assert order: --system-prompt-file comes before the path, then -p, then the prompt.
    const systemPromptIdx = args.indexOf('--system-prompt-file');
    const pathIdx = args.indexOf(forgePath);
    const pIdx = args.indexOf('-p');
    const promptIdx = args.indexOf(forgeUserPrompt);

    expect(systemPromptIdx).toBeGreaterThanOrEqual(0);
    expect(pathIdx).toBeGreaterThanOrEqual(0);
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(promptIdx).toBeGreaterThanOrEqual(0);
    expect(systemPromptIdx).toBeLessThan(pathIdx);
    expect(pathIdx).toBeLessThan(pIdx);
    expect(pIdx).toBeLessThan(promptIdx);

    // Also verify the final output includes --add-dir for the vault.
    expect(args).toContain('--add-dir');
    expect(args).toContain('/vault');
  });

  it('never includes --provider flag for local cast arguments', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '',
    });

    expect(args).not.toContain('--provider');
    expect(args).not.toContain('claude-code');
  });

  it('omits --mcp-config and --strict-mcp-config when mcpConfigPath is empty', () => {
    const args = buildCastArgs({
      metaSpell: 'spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '',
    });
    expect(args).not.toContain('--mcp-config');
    expect(args).not.toContain('--strict-mcp-config');
  });

  it('omits both MCP flags when mcpConfigPath is whitespace-only', () => {
    const args = buildCastArgs({
      metaSpell: 'spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '   ',
    });
    expect(args).not.toContain('--mcp-config');
    expect(args).not.toContain('--strict-mcp-config');
  });

  it('appends --mcp-config <path> --strict-mcp-config when mcpConfigPath is non-empty', () => {
    const args = buildCastArgs({
      metaSpell: 'spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: '/abs/path/mcp.json',
    });
    const mcpIdx = args.indexOf('--mcp-config');
    expect(mcpIdx).toBeGreaterThanOrEqual(0);
    expect(args[mcpIdx + 1]).toBe('/abs/path/mcp.json');
    const strictIdx = args.indexOf('--strict-mcp-config');
    expect(strictIdx).toBeGreaterThanOrEqual(0);
    expect(strictIdx - mcpIdx).toBe(2); // consecutive: --mcp-config <path> --strict-mcp-config
  });

  it('MCP flags coexist with --effort and --add-dir', () => {
    const args = buildCastArgs({
      metaSpell: 'spell',
      modelId: 'claude-sonnet-4-5',
      effort: 'high',
      vaultMountPath: '/v',
      mcpConfigPath: '/abs/m.json',
    });
    expect(args).toContain('--effort');
    expect(args).toContain('high');
    expect(args).toContain('--add-dir');
    expect(args).toContain('/v');
    expect(args).toContain('--mcp-config');
    expect(args).toContain('/abs/m.json');
    expect(args).toContain('--strict-mcp-config');
  });

  it('passes mcpConfigPath verbatim (untrimmed) when path has surrounding whitespace', () => {
    const rawPath = '  /abs/path/mcp.json  ';
    const args = buildCastArgs({
      metaSpell: 'spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
      mcpConfigPath: rawPath,
    });
    const mcpIdx = args.indexOf('--mcp-config');
    expect(mcpIdx).toBeGreaterThanOrEqual(0);
    expect(args[mcpIdx + 1]).toBe(rawPath);
  });

  it('MCP flags coexist with --system-prompt-file file-mode and appear at tail', () => {
    const args = buildCastArgs({
      systemPromptFile: '/sys.md',
      userPrompt: 'prompt',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '/vault',
      mcpConfigPath: '/mcp.json',
    });
    const sysIdx = args.indexOf('--system-prompt-file');
    const mcpIdx = args.indexOf('--mcp-config');
    expect(sysIdx).toBeGreaterThanOrEqual(0);
    expect(mcpIdx).toBeGreaterThan(sysIdx);
    expect(args).toContain('--strict-mcp-config');
  });
});
