/**
 * Integration tests for the custom-refine cast resolution wiring seam (Section F of plan 029).
 * Uses CommandPopupBuilder (real) to test the full pipeline:
 *   refineCastAction → resolveRefinePath → CastDispatcher.dispatch
 * Uses vi.spyOn(CastRunner.prototype, 'run') to capture cast inputs without spawning.
 *
 * Seam: CommandPopupBuilder.build() produces a CommandPopup whose refineCastAction closure
 * is the join-point between the per-cast / Settings / bundled-default resolution logic
 * and the cast pipeline's systemPromptFilePath argument.
 *
 * These tests are written RED before F1 implements the resolver wiring.
 * They will fail until CommandPopupBuilder.refineCastAction calls resolveRefinePath.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App, Notice, TFile } from 'obsidian';
import { CommandPopupBuilder } from '../../src/ui/popup/CommandPopupBuilder';
import { CastDispatcher } from '../../src/cast/CastDispatcher';
import { CastRunner } from '../../src/cast/local/CastRunner';
import { createCaster } from '../../src/cast/createCaster';
import { PluginPaths } from '../../src/infra/PluginPaths';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { ForgeImprinter } from '../../src/forge/ForgeImprinter';
import { REFINE_SENTINEL_PATH } from '../../src/domain/spells/Spell';
import { modelId } from '../../src/domain/settings/ModelId';
import type { GrimoireData } from '../../src/domain/settings/Settings';
import type { CastLogWriter } from '../../src/castLog/CastLogWriter';

// ─── shared settings fixture ────────────────────────────────────────────────

const BUNDLED_PLUGIN_DIR = '.obsidian/plugins/grimoire';
const CUSTOM_PATH = 'Spells/My Custom Refine.md';
const VARIANT_PATH = 'spells/Variant.md';
const SETTINGS_ACTIVE_PATH = 'Spells/Settings Active Refine.md';

const BASE_SETTINGS: GrimoireData['settings'] = {
  vaultMountPath: '/vault',
  spellTag: 'grimoire/spell',
  binaryPath: '/usr/bin/claude',
  forgeOutputFolder: 'Spells/',
  defaultModel: modelId('claude-sonnet-4-5'),
  defaultEffort: 'medium',
  executionMode: 'local',
  portalHost: '',
  portalPort: '',
  portalPath: '',
  portalAuthUser: '',
  portalAuthPassword: '',
  activeRefinePath: null,
};

// ─── harness factory ─────────────────────────────────────────────────────────

function makeLogWriter(): CastLogWriter {
  return {
    recordCasted: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeCastLogPanelDeps() {
  return {
    source: { load: vi.fn().mockResolvedValue([]) },
    refresh: { start: vi.fn(), stop: vi.fn() },
    tick: { start: vi.fn(), stop: vi.fn() },
    now: () => new Date(),
    mutator: { deleteCast: vi.fn().mockResolvedValue(undefined), clearAll: vi.fn().mockResolvedValue(undefined) },
    app: new App() as any,
  };
}

interface HarnessOptions {
  settings?: Partial<GrimoireData['settings']>;
  sessionMap?: OptionsSessionMap;
  logWriter?: CastLogWriter;
  /** If provided, wires app.vault.getAbstractFileByPath and app.metadataCache.getFileCache
   *  so the given paths are recognised as sentinel-marked. */
  sentinelPaths?: string[];
}

function createBuilderHarness(options: HarnessOptions = {}) {
  const app = new App() as any;

  // Provide 10 spell files so Refine is at index 11 (ArrowUp wraps to last)
  app.vault.getMarkdownFiles.mockReturnValue(
    Array.from({ length: 10 }, (_, i) => ({
      basename: `Spell ${i + 1}`,
      path: `/spells/spell-${i + 1}.md`,
    })),
  );
  app.metadataCache.getFileCache.mockReturnValue({
    frontmatter: { tags: ['grimoire/spell'] },
  });

  const sentinelPaths = options.sentinelPaths ?? [];

  // Wire getAbstractFileByPath so sentinel paths return a real TFile mock instance
  // (instanceof TFile must hold for the isSentinel guard in CommandPopupBuilder)
  app.vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
    if (sentinelPaths.includes(path)) {
      const basename = path.split('/').pop()?.replace('.md', '') ?? '';
      return new TFile(basename, path);
    }
    return null;
  });

  // Override getFileCache so sentinel-path files report sentinel: refine in frontmatter
  app.metadataCache.getFileCache.mockImplementation((file: any) => {
    const filePath = typeof file === 'string' ? file : file?.path;
    if (filePath && sentinelPaths.includes(filePath)) {
      return { frontmatter: { sentinel: 'refine' } };
    }
    return { frontmatter: { tags: ['grimoire/spell'] } };
  });

  const logWriter = options.logWriter ?? makeLogWriter();

  const overrides = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  const paths = new PluginPaths(BUNDLED_PLUGIN_DIR);

  const settings: GrimoireData['settings'] = {
    ...BASE_SETTINGS,
    ...(options.settings ?? {}),
  };

  const pluginData: GrimoireData = { settings, spellOverrides: {} };

  const sessionMap = options.sessionMap ?? new OptionsSessionMap();

  const imprinter = new ForgeImprinter({
    notify: vi.fn(),
    caster: vi.fn() as any,
    logWriter: () => logWriter,
    forgeSpellPaths: () => ({
      absForCaster: '/vault/.obsidian/plugins/grimoire/forge.md',
      vaultRelForPortal: '.obsidian/plugins/grimoire/forge.md',
    }),
  });

  const builder = new CommandPopupBuilder({
    app,
    plugin: { data: pluginData, overrides },
    imprinter,
    sessionMap,
    castLogPanelDeps: makeFakeCastLogPanelDeps(),
    createDispatcher: (close) =>
      new CastDispatcher({
        notify: (msg) => {
          new Notice(msg);
        },
        close,
        caster: () => createCaster(settings),
        logWriter: () => logWriter,
      }),
    paths,
  });

  const popup = builder.build();
  popup.open();
  const { contentEl } = popup;

  function pressKey(key: string, modifiers: string[] = []): boolean {
    return (popup.scope as unknown as { dispatch(k: string, m: string[]): boolean }).dispatch(
      key,
      modifiers,
    );
  }

  // ArrowUp once from index 0 wraps to Refine (last item: 10 spells + Forge + Refine)
  function navigateToRefine(): void {
    pressKey('ArrowUp');
  }

  return {
    popup,
    contentEl,
    app,
    logWriter,
    pressKey,
    navigateToRefine,
    paths,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('custom-refine-cast integration — resolveRefinePath wiring seam', () => {
  let runSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});
    Notice.instances.length = 0;
  });

  afterEach(() => {
    runSpy.mockRestore();
    Notice.instances.length = 0;
  });

  // ─── F0-a: no custom configured, no per-cast override ───────────────────

  it('F0-a — activeRefinePath null, no session override: dispatcher receives bundled default systemPromptFilePath, no Notice posted', () => {
    const h = createBuilderHarness({
      settings: { activeRefinePath: null },
    });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });
    h.navigateToRefine();
    h.pressKey('Enter');

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0] as any[];

    // systemPromptFile must be the bundled default (paths.refineSpellPathVaultRel() — vault-relative,
    // passed through directly as systemPromptFilePath; CastDispatcher does not prepend vaultMountPath
    // when systemPromptFilePath is explicitly provided)
    const expectedBundled = h.paths.refineSpellPathVaultRel();
    expect(runInput.systemPromptFile).toBe(expectedBundled);

    // No fallback Notice should be posted
    const fallbackNotice = Notice.instances.find(
      (n) => n.message === 'Custom Refine spell not found — using default',
    );
    expect(fallbackNotice).toBeUndefined();
  });

  // ─── F0-b: Settings-active custom, no per-cast override ─────────────────

  it('F0-b — activeRefinePath set to a sentinel-marked file, no per-cast override: dispatcher receives that custom path, no Notice', () => {
    const h = createBuilderHarness({
      settings: { activeRefinePath: CUSTOM_PATH },
      sentinelPaths: [CUSTOM_PATH],
    });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });
    h.navigateToRefine();
    h.pressKey('Enter');

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0] as any[];

    // systemPromptFile must be the custom path (vault-relative, passed through directly)
    expect(runInput.systemPromptFile).toBe(CUSTOM_PATH);

    // No fallback Notice
    const fallbackNotice = Notice.instances.find(
      (n) => n.message === 'Custom Refine spell not found — using default',
    );
    expect(fallbackNotice).toBeUndefined();
  });

  // ─── F0-c: Settings-active custom, file missing or un-marked ────────────

  it('F0-c — activeRefinePath set but file missing (getAbstractFileByPath returns null): dispatcher receives bundled default, Notice posted', () => {
    // sentinelPaths is empty so getAbstractFileByPath returns null for CUSTOM_PATH
    const h = createBuilderHarness({
      settings: { activeRefinePath: CUSTOM_PATH },
      sentinelPaths: [],
    });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });
    h.navigateToRefine();
    h.pressKey('Enter');

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0] as any[];

    // systemPromptFile must fall back to the bundled default (vault-relative)
    const expectedBundled = h.paths.refineSpellPathVaultRel();
    expect(runInput.systemPromptFile).toBe(expectedBundled);

    // Fallback Notice must be posted with the exact pitch-mandated text
    const fallbackNotice = Notice.instances.find(
      (n) => n.message === 'Custom Refine spell not found — using default',
    );
    expect(fallbackNotice).toBeDefined();
  });

  // ─── F0-d: per-cast override wins over Settings ──────────────────────────

  it('F0-d — session refinePathOverride wins over settings.activeRefinePath: dispatcher receives the per-cast path, no Notice', () => {
    const sessionMap = new OptionsSessionMap();
    sessionMap.put(REFINE_SENTINEL_PATH, {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false,
      refinePathOverride: VARIANT_PATH,
    });

    const h = createBuilderHarness({
      settings: { activeRefinePath: SETTINGS_ACTIVE_PATH },
      sentinelPaths: [VARIANT_PATH, SETTINGS_ACTIVE_PATH],
      sessionMap,
    });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });
    h.navigateToRefine();
    h.pressKey('Enter');

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0] as any[];

    // systemPromptFile must be the per-cast override path (vault-relative)
    expect(runInput.systemPromptFile).toBe(VARIANT_PATH);

    // No fallback Notice (VARIANT_PATH is sentinel-marked)
    const fallbackNotice = Notice.instances.find(
      (n) => n.message === 'Custom Refine spell not found — using default',
    );
    expect(fallbackNotice).toBeUndefined();
  });

  // ─── F0-e: per-cast override === null overrides Settings to bundled ──────

  it('F0-e — session refinePathOverride === null (explicit Default) overrides settings.activeRefinePath: dispatcher receives bundled default, no Notice', () => {
    const sessionMap = new OptionsSessionMap();
    sessionMap.put(REFINE_SENTINEL_PATH, {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false,
      refinePathOverride: null, // explicit "Default (built-in)"
    });

    const h = createBuilderHarness({
      settings: { activeRefinePath: SETTINGS_ACTIVE_PATH },
      sentinelPaths: [SETTINGS_ACTIVE_PATH],
      sessionMap,
    });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });
    h.navigateToRefine();
    h.pressKey('Enter');

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0] as any[];

    // systemPromptFile must be the bundled default (null override forces it; vault-relative)
    const expectedBundled = h.paths.refineSpellPathVaultRel();
    expect(runInput.systemPromptFile).toBe(expectedBundled);

    // No fallback Notice — null override is intentional, not a fallback
    const fallbackNotice = Notice.instances.find(
      (n) => n.message === 'Custom Refine spell not found — using default',
    );
    expect(fallbackNotice).toBeUndefined();
  });
});
