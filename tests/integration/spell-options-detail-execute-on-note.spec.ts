/**
 * Integration test: SpellOptionsDetail #buildFormState seeding executeOnNote.
 *
 * Tests that executeOnNote is seeded from spell.executeOnNote,
 * with session entry taking precedence.
 */

import { describe, it, expect, vi } from 'vitest';
import { App } from 'obsidian';
import type { Spell } from '../../src/domain/spells/Spell';
import type { SpellPath } from '../../src/domain/spells/SpellPath';
import { OptionsDetail } from '../../src/ui/components/OptionsDetail';
import { modelId } from '../../src/domain/settings/ModelId';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { vi as vitestVi } from 'vitest';

describe('OptionsDetail #buildFormState executeOnNote seeding (spell kind)', () => {
  // Test 1: spell.executeOnNote === false, no session entry → form snapshot has executeOnNote: false
  it('seeds executeOnNote with false when spell.executeOnNote is false and no session entry', () => {
    const spell: Spell = {
      name: 'test-spell',
      path: 'test-spell.md' as SpellPath,
      executeOnNote: false,
    };

    const sessionMap = new OptionsSessionMap();
    const overrides = new SpellOverrideStore({
      data: { settings: {} as any, spellOverrides: {} },
      saver: { schedule: vi.fn() } as any,
    });
    const onCastCallback = vi.fn();

    const contentEl = document.createElement('div');
    const app = new App() as any;
    app.vault.getMarkdownFiles.mockReturnValue([]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { tags: ['spell'] },
    });

    const detail = new OptionsDetail();
    detail.render({
      contentEl,
      scope: { register: vi.fn(), unregister: vi.fn() } as any,
      app,
      overrides,
      sessionMap,
      formDefaults: { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' },
      models: [{ id: modelId('claude-sonnet-4-5'), displayName: 'Sonnet', effortOptions: ['medium', 'high'], defaultEffort: 'medium' }],
      onBack: () => {},
      onCast: onCastCallback,
      onOverrideChanged: () => {},
      kind: { kind: 'spell', spell },
    });

    // Trigger Cast to capture the snapshot
    const form = contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();
    form.dispatchEvent(new Event('submit'));

    expect(onCastCallback).toHaveBeenCalledOnce();
    const snapshot = (onCastCallback as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(snapshot.executeOnNote).toBe(false);

    detail.destroy();
  });

  // Test 2: spell.executeOnNote === true, session entry has executeOnNote: false → form snapshot has executeOnNote: false (session wins)
  it('seeds executeOnNote from session entry when present, overriding spell value', () => {
    const spell: Spell = {
      name: 'test-spell-2',
      path: 'test-spell-2.md' as SpellPath,
      executeOnNote: true, // spell says true
    };

    const sessionMap = new OptionsSessionMap();
    sessionMap.put('test-spell-2.md' as SpellPath, {
      model: modelId('claude-opus-4-5'),
      effort: 'high',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false, // session entry says false — should win
    });

    const overrides = new SpellOverrideStore({
      data: { settings: {} as any, spellOverrides: {} },
      saver: { schedule: vi.fn() } as any,
    });
    const onCastCallback = vi.fn();

    const contentEl = document.createElement('div');
    const app = new App() as any;
    app.vault.getMarkdownFiles.mockReturnValue([]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { tags: ['spell'] },
    });

    const detail = new OptionsDetail();
    detail.render({
      contentEl,
      scope: { register: vi.fn(), unregister: vi.fn() } as any,
      app,
      overrides,
      sessionMap,
      formDefaults: { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' },
      models: [{ id: modelId('claude-sonnet-4-5'), displayName: 'Sonnet', effortOptions: ['medium', 'high'], defaultEffort: 'medium' }],
      onBack: () => {},
      onCast: onCastCallback,
      onOverrideChanged: () => {},
      kind: { kind: 'spell', spell },
    });

    const form = contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();
    form.dispatchEvent(new Event('submit'));

    expect(onCastCallback).toHaveBeenCalledOnce();
    const snapshot = (onCastCallback as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(snapshot.executeOnNote).toBe(false); // session entry value should win

    detail.destroy();
  });

  // Test 3: spell.executeOnNote === true, no session entry → form snapshot has executeOnNote: true
  it('seeds executeOnNote with true when spell.executeOnNote is true and no session entry', () => {
    const spell: Spell = {
      name: 'test-spell-3',
      path: 'test-spell-3.md' as SpellPath,
      executeOnNote: true,
    };

    const sessionMap = new OptionsSessionMap();
    // No session entry for this spell

    const overrides = new SpellOverrideStore({
      data: { settings: {} as any, spellOverrides: {} },
      saver: { schedule: vi.fn() } as any,
    });
    const onCastCallback = vi.fn();

    const contentEl = document.createElement('div');
    const app = new App() as any;
    app.vault.getMarkdownFiles.mockReturnValue([]);
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { tags: ['spell'] },
    });

    const detail = new OptionsDetail();
    detail.render({
      contentEl,
      scope: { register: vi.fn(), unregister: vi.fn() } as any,
      app,
      overrides,
      sessionMap,
      formDefaults: { defaultModel: modelId('claude-sonnet-4-5'), defaultEffort: 'medium' },
      models: [{ id: modelId('claude-sonnet-4-5'), displayName: 'Sonnet', effortOptions: ['medium', 'high'], defaultEffort: 'medium' }],
      onBack: () => {},
      onCast: onCastCallback,
      onOverrideChanged: () => {},
      kind: { kind: 'spell', spell },
    });

    const form = contentEl.querySelector('form.options-panel') as HTMLFormElement;
    expect(form).not.toBeNull();
    form.dispatchEvent(new Event('submit'));

    expect(onCastCallback).toHaveBeenCalledOnce();
    const snapshot = (onCastCallback as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(snapshot.executeOnNote).toBe(true);

    detail.destroy();
  });
});
