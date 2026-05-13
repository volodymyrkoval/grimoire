import { describe, it, expect } from 'vitest';
import { buildCastArgs } from '../src/cast/buildCastArgs';

describe('buildCastArgs', () => {
  it('builds inline mode args with metaSpell', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell content',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '',
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
    });
    expect(args).not.toContain('--effort');
  });

  it('includes --add-dir when vaultMountPath is non-empty', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-sonnet-4-5',
      effort: null,
      vaultMountPath: '/vault/mount',
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
    });
    expect(args).not.toContain('--add-dir');
  });

  it('combines effort and vaultMountPath flags', () => {
    const args = buildCastArgs({
      metaSpell: 'my spell',
      modelId: 'claude-opus-4-5',
      effort: 'xhigh',
      vaultMountPath: '/vault',
    });
    expect(args).toContain('--effort');
    expect(args).toContain('xhigh');
    expect(args).toContain('--add-dir');
    expect(args).toContain('/vault');
  });
});
