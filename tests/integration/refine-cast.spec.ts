/**
 * Integration tests for the Refine cast trigger seam (Section E of plan 019).
 * Uses CommandPopupBuilder (real) to test the full pipeline:
 *   active-note guard → CastDispatcher.dispatch → popup dismiss.
 * Uses vi.spyOn(CastRunner.prototype, 'run') to capture cast inputs without spawning.
 *
 * Seam: CommandPopupBuilder.build() produces a CommandPopup whose refineCastAction closure
 * is the join-point between the UI layer and the cast pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App, Notice } from 'obsidian';
import { CommandPopupBuilder } from '../../src/ui/popup/CommandPopupBuilder';
import { CastDispatcher } from '../../src/cast/CastDispatcher';
import { CastRunner } from '../../src/cast/local/CastRunner';
import { createCaster } from '../../src/cast/createCaster';
import { PluginPaths } from '../../src/infra/PluginPaths';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { ForgeImprinter } from '../../src/forge/ForgeImprinter';
import { REFINE_SENTINEL_PATH } from '../../src/domain/spells/Spell';
import { REFINE_SPELL_PATH } from '../../src/castLog/types';
import { resolveDisplayName } from '../../src/castLog/format/displayName';
import type { CastRecord } from '../../src/castLog/CastRecord';
import type { GrimoireData } from '../../src/domain/settings/Settings';
import type { CastLogWriter } from '../../src/castLog/CastLogWriter';

// ─── shared settings fixture ────────────────────────────────────────────────

const BASE_SETTINGS: GrimoireData['settings'] = {
  vaultMountPath: '/vault',
  spellTag: 'grimoire/spell',
  binaryPath: '/usr/bin/claude',
  cliCommand: 'claude',
  forgeOutputFolder: 'Spells/',
  defaultModel: 'claude-sonnet-4-5',
  defaultEffort: 'medium',
  executionMode: 'local',
  portalHost: '',
  portalPort: '',
  portalPath: '',
  portalAuthUser: '',
  portalAuthPassword: '',
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
  };
}

interface HarnessOptions {
  overrides?: SpellOverrideStore;
  logWriter?: CastLogWriter;
  settings?: Partial<GrimoireData['settings']>;
}

function createBuilderHarness(options: HarnessOptions = {}) {
  const app = new App() as any;

  // Provide 10 spell files so Refine is at index 11 (after Forge at 10)
  app.vault.getMarkdownFiles.mockReturnValue(
    Array.from({ length: 10 }, (_, i) => ({
      basename: `Spell ${i + 1}`,
      path: `/spells/spell-${i + 1}.md`,
    }))
  );
  app.metadataCache.getFileCache.mockReturnValue({
    frontmatter: { tags: ['grimoire/spell'] },
  });

  const logWriter = options.logWriter ?? makeLogWriter();
  const overrides = options.overrides ?? new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  // pluginDir is vault-relative; PluginPaths normalises the path
  const paths = new PluginPaths('.obsidian/plugins/grimoire');

  const settings: GrimoireData['settings'] = {
    ...BASE_SETTINGS,
    ...(options.settings ?? {}),
  };

  const pluginData: GrimoireData = { settings, spellOverrides: {} };

  const imprinter = new ForgeImprinter({
    notify: vi.fn(),
    caster: vi.fn() as any,
    logWriter: () => logWriter,
    forgeSpellPaths: () => ({
      absForCaster: '/vault/.obsidian/plugins/grimoire/forge.md',
      vaultRelForPortal: '.obsidian/plugins/grimoire/forge.md',
    }),
  });

  const sessionMap = new OptionsSessionMap();

  const builder = new CommandPopupBuilder({
    app,
    plugin: { data: pluginData, overrides },
    imprinter,
    sessionMap,
    castLogPanelDeps: makeFakeCastLogPanelDeps(),
    createDispatcher: (close) =>
      new CastDispatcher({
        notify: (msg) => { new Notice(msg); },
        close,
        caster: () => createCaster(settings),
        logWriter: () => logWriter,
      }),
    paths,
  });

  const popup = builder.build();
  popup.open();
  const { contentEl } = popup;

  // Keyboard dispatch helper
  function pressKey(key: string, modifiers: string[] = []): boolean {
    return (popup.scope as unknown as { dispatch(k: string, m: string[]): boolean }).dispatch(
      key,
      modifiers,
    );
  }

  // ArrowUp once from index 0 wraps to Refine (index 11: 10 spells + Forge + Refine)
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
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('refine-cast integration — CommandPopupBuilder → cast pipeline seam', () => {
  let runSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Intercept process spawn at the lowest boundary; return immediately
    runSpy = vi.spyOn(CastRunner.prototype, 'run').mockImplementation(() => {});
    // Clear Notice instances so guard-test assertions are isolated
    Notice.instances.length = 0;
  });

  afterEach(() => {
    runSpy.mockRestore();
    Notice.instances.length = 0;
  });

  // ─── TC1: List-Enter happy path with active markdown note ───────────────

  it('TC1 — list-Enter on Refine with active .md note: CastRunner.run called, systemPromptFile ends with refine.md, userPrompt contains note path, recordCasted called with <refine>, modal closed', () => {
    const logWriter = makeLogWriter();
    const h = createBuilderHarness({ logWriter });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });

    h.navigateToRefine();
    h.pressKey('Enter');

    // CastRunner.prototype.run must have been called once
    expect(runSpy).toHaveBeenCalledOnce();

    const [runInput] = runSpy.mock.calls[0] as any[];

    // systemPromptFile must point at refine.md
    expect(runInput.systemPromptFile).toMatch(/refine\.md$/);

    // userPrompt must contain the active note path
    expect(runInput.userPrompt).toContain('notes/today.md');

    // recordCasted must have been called with the refine sentinel
    expect(logWriter.recordCasted).toHaveBeenCalledOnce();
    expect(logWriter.recordCasted).toHaveBeenCalledWith(
      expect.objectContaining({ spellPath: REFINE_SPELL_PATH }),
    );

    // Modal must be fully detached (dismiss() was called)
    expect(h.popup.containerEl.parentElement).toBeNull();
  });

  // ─── TC2: List-Enter no-active-note guard ───────────────────────────────

  it('TC2 — list-Enter on Refine with no active note: Notice shown, CastRunner.run NOT called, recordCasted NOT called, modal stays open', () => {
    const logWriter = makeLogWriter();
    const h = createBuilderHarness({ logWriter });

    h.app.workspace.setActiveFile(null);

    h.navigateToRefine();
    h.pressKey('Enter');

    // Notice must have been raised with the guard message
    expect(Notice.instances.length).toBeGreaterThanOrEqual(1);
    expect(Notice.instances.some((n) => n.message === 'Refine needs an open note')).toBe(true);

    // No cast was spawned
    expect(runSpy).not.toHaveBeenCalled();
    expect(logWriter.recordCasted).not.toHaveBeenCalled();

    // Modal is still open
    expect(h.popup.containerEl.parentElement).not.toBeNull();
  });

  // ─── TC3: List-Enter non-markdown active file guard ─────────────────────

  it('TC3 — list-Enter on Refine with non-markdown active file: Notice shown, no cast, modal stays open', () => {
    const logWriter = makeLogWriter();
    const h = createBuilderHarness({ logWriter });

    h.app.workspace.setActiveFile({ path: 'image.png', extension: 'png' });

    h.navigateToRefine();
    h.pressKey('Enter');

    expect(Notice.instances.some((n) => n.message === 'Refine needs an open note')).toBe(true);
    expect(runSpy).not.toHaveBeenCalled();
    expect(logWriter.recordCasted).not.toHaveBeenCalled();
    expect(h.popup.containerEl.parentElement).not.toBeNull();
  });

  // ─── TC4: Dialog-Cast happy path with active markdown note ──────────────

  it('TC4 — dialog-Cast on Refine with active .md note: executeOnNote checkbox absent, CastRunner.run called, recordCasted called, modal closed', () => {
    const logWriter = makeLogWriter();
    const h = createBuilderHarness({ logWriter });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });

    // Navigate to Refine then open options dialog
    h.navigateToRefine();
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement | null;
    expect(form).not.toBeNull();

    // executeOnNote checkbox must be absent from the Refine dialog
    const executeOnNoteCheckbox = form!.querySelector('input[data-grimoire="execute-on-note"]');
    expect(executeOnNoteCheckbox).toBeNull();

    // Submit the dialog form
    form!.dispatchEvent(new Event('submit'));

    // Cast was dispatched
    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0] as any[];
    expect(runInput.systemPromptFile).toMatch(/refine\.md$/);

    // recordCasted called with refine sentinel
    expect(logWriter.recordCasted).toHaveBeenCalledWith(
      expect.objectContaining({ spellPath: REFINE_SPELL_PATH }),
    );

    // Modal is fully closed
    expect(h.popup.containerEl.parentElement).toBeNull();
  });

  // ─── TC5: Dialog-Cast no-active-note guard ──────────────────────────────

  it('TC5 — dialog-Cast with no active note: Notice shown, no cast, recordCasted NOT called', () => {
    const logWriter = makeLogWriter();
    const h = createBuilderHarness({ logWriter });

    h.app.workspace.setActiveFile(null);

    h.navigateToRefine();
    h.pressKey('ArrowRight');

    const form = h.contentEl.querySelector('form.options-panel') as HTMLFormElement | null;
    expect(form).not.toBeNull();

    form!.dispatchEvent(new Event('submit'));

    expect(Notice.instances.some((n) => n.message === 'Refine needs an open note')).toBe(true);
    expect(runSpy).not.toHaveBeenCalled();
    expect(logWriter.recordCasted).not.toHaveBeenCalled();
  });

  // ─── TC6: List-Enter override persistence ───────────────────────────────

  it('TC6 — list-Enter with override stored under REFINE_SENTINEL_PATH: CastRunner.run called with overridden modelId and effort', () => {
    const overrides = new SpellOverrideStore({
      data: {
        settings: {} as any,
        spellOverrides: {
          [REFINE_SENTINEL_PATH]: { model: 'claude-opus-4-5', effort: 'high' },
        },
      },
      saver: { schedule: vi.fn() } as any,
    });

    const h = createBuilderHarness({ overrides });
    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });

    h.navigateToRefine();
    h.pressKey('Enter');

    expect(runSpy).toHaveBeenCalledOnce();
    const [runInput] = runSpy.mock.calls[0] as any[];

    // Override model and effort must flow through to CastRunner
    expect(runInput.modelId).toBe('claude-opus-4-5');
    expect(runInput.effort).toBe('high');
  });

  // ─── TC7: Cast-log row resolves display name as 'Refine' ────────────────

  it('TC7 — resolveDisplayName on a recordCasted call with spellPath <refine> returns "Refine"', () => {
    const logWriter = makeLogWriter();
    const h = createBuilderHarness({ logWriter });

    h.app.workspace.setActiveFile({ path: 'notes/today.md', extension: 'md' });

    h.navigateToRefine();
    h.pressKey('Enter');

    expect(logWriter.recordCasted).toHaveBeenCalledOnce();

    // Reconstruct a minimal CastRecord from the recordCasted argument
    const recordedArg = (logWriter.recordCasted as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const stubRecord: CastRecord = {
      castId: recordedArg.castId ?? 'stub-id',
      status: 'casted',
      spellPath: recordedArg.spellPath,
      model: recordedArg.model ?? 'claude-sonnet-4-5',
      effort: recordedArg.effort ?? null,
      contextNotes: recordedArg.contextNotes ?? [],
      castedTs: new Date().toISOString(),
    };

    expect(resolveDisplayName(stubRecord)).toBe('Refine');
  });
});
