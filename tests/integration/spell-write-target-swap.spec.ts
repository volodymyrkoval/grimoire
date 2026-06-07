/**
 * Integration test: F0 — Panel write-target swap + notification dot (RED until F1–F3 land).
 *
 * Seam (a–c): OptionsPanel (parent) and its real children: CastModelSection, EffortRow,
 * the model <select>, and the cast submit button. The seam under test is the dep interface
 * on CastModelSection: after F2, it will carry `setVaultDefault`, `writeCasting`, `reader`
 * instead of `overrides`. Tests are written against the new expected behaviour; they fail
 * red because F2 has not yet swapped the write target.
 *
 * Seam (d): CommandPopup (parent) and its real children: SpellsPanel, SpellList, SpellRow.
 * The seam under test is `#handleHasOverride`. After F3, it calls `reader(path) !== null`;
 * currently it calls `overrides.has(path)`. The test asserts the dot appears when reader
 * returns a block; currently it doesn't fire → red.
 *
 * RED criterion:
 *   (a) Set-as-default fires setVaultDefault and NOT writeCasting
 *       → fails red because CastModelSection calls deps.overrides.set(), not setVaultDefault
 *   (b) Cast after model change calls writeCasting with the new block
 *       → fails red because CastModelSection never calls writeCasting on Cast
 *   (c) Cast with no change does NOT call writeCasting
 *       → may pass green even before F2 (writeCasting not wired), serves as baseline anchor
 *   (d) Override dot lights when reader returns a block
 *       → fails red because #handleHasOverride calls overrides.has() which returns false
 */

import { App, Scope } from 'obsidian';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { OptionsPanel } from '../../src/ui/options/OptionsPanel';
import { OptionsFormState } from '../../src/ui/options/OptionsFormState';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { modelId } from '../../src/domain/settings/ModelId';
import { spellPath } from '../../src/domain/spells/SpellPath';
import type { OptionsPanelDeps } from '../../src/ui/options/OptionsPanel';
import type { CastingFrontmatterWriter, CastingFrontmatterReader } from '../../src/infra/castingFrontmatter';
import type { SpellCastingSettings } from '../../src/domain/settings/CastingSettings';
import { createPopupHarness } from './harness';

// ── Shared fixture helpers ────────────────────────────────────────────────────

const TEST_SPELL_PATH = spellPath('/spells/fireball.md');
const SONNET_MODEL = modelId('sonnet');
const OPUS_MODEL = modelId('opus');

/**
 * Augmented deps that carry the post-F2 ports alongside the legacy overrides field
 * (still present so the OptionsPanel constructor compiles). The new ports are passed
 * as `as any` because the type changes land in F2.
 */
interface NewCastModelSectionDeps {
  /** Replaces overrides.set/clear for per-spell writes. Called on Cast when block changed. */
  writeCasting: CastingFrontmatterWriter;
  /** Called when the user ticks "Set as default"; writes plugin-wide defaults. */
  setVaultDefault: (model: ReturnType<typeof modelId>, effort: string | null) => void;
  /** Reads the current frontmatter block for change-detection on Cast. */
  reader: CastingFrontmatterReader;
}

interface MountResult {
  contentEl: HTMLElement;
  writeCasting: ReturnType<typeof vi.fn>;
  setVaultDefault: ReturnType<typeof vi.fn>;
  reader: ReturnType<typeof vi.fn>;
  panel: OptionsPanel;
}

/**
 * Mounts an OptionsPanel using the future (post-F2) deps shape.
 * The new ports are injected via `as any` since they don't yet exist in
 * OptionsPanelDeps — the TypeScript types will be updated by F2.
 *
 * @param initialModel  Model to seed form and snapshot with (default: Sonnet)
 * @param readerReturnValue  What the reader mock returns (default: null = no block)
 */
function mountPanelWithNewDeps(options?: {
  initialModel?: ReturnType<typeof modelId>;
  readerReturnValue?: SpellCastingSettings | null;
}): MountResult {
  const initialModel = options?.initialModel ?? SONNET_MODEL;
  const readerReturnValue = options?.readerReturnValue ?? null;

  const contentEl = document.createElement('div');
  const scope = new Scope();
  const app = new App() as any;
  const sessionMap = new OptionsSessionMap();

  // Legacy overrides — still in OptionsPanelDeps until I-series cleanup lands.
  const overrides = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  // Post-F2 port mocks
  const writeCasting = vi.fn().mockResolvedValue(undefined);
  const setVaultDefault = vi.fn();
  const reader: CastingFrontmatterReader = vi.fn().mockReturnValue(readerReturnValue);

  const formState = new OptionsFormState({
    model: initialModel,
    effort: 'medium',
    contextNotePaths: [],
    followUp: '',
    executeOnNote: true,
  });
  const snapshot = { model: initialModel, effort: 'medium' as const };

  const deps: OptionsPanelDeps & NewCastModelSectionDeps = {
    app,
    // Legacy overrides field — OptionsPanel still threads it to CastModelSection until F2.
    overrides,
    sessionMap,
    spellPath: TEST_SPELL_PATH,
    onCast: vi.fn(),
    onOverrideChanged: vi.fn(),
    onBack: vi.fn(),
    // Post-F2 ports (unknown to TypeScript until F2 lands the type update).
    writeCasting,
    setVaultDefault,
    reader,
  };

  const panel = new OptionsPanel(scope);
  // Cast deps to `any` then back to the expected type: the new ports don't exist in
  // OptionsPanelDeps yet. After F2 updates the type, the cast can be removed.
  panel.render(contentEl, formState, snapshot, deps as any as OptionsPanelDeps);

  return { contentEl, writeCasting, setVaultDefault, reader, panel };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('F0: Panel write-target swap + notification dot', () => {
  // ── (a) Set-as-default fires setVaultDefault and NOT writeCasting ─────────

  describe('(a) Set-as-default fires setVaultDefault and does not write frontmatter', () => {
    it('ticking "Set as default" invokes setVaultDefault once with the current model and effort', () => {
      const { contentEl, setVaultDefault, writeCasting } = mountPanelWithNewDeps();

      const form = contentEl.querySelector('form.options-panel')!;
      const select = form.querySelector<HTMLSelectElement>('select')!;

      // Change model to Opus so the "Set as default" checkbox label becomes visible.
      select.value = 'opus';
      select.dispatchEvent(new Event('change'));

      const checkbox = form.querySelector<HTMLInputElement>('input[data-grimoire="set-as-default"]')!;
      expect(checkbox).not.toBeNull();

      // Tick the checkbox.
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      // RED: CastModelSection currently calls deps.overrides.set(path, override),
      // not deps.setVaultDefault(model, effort). This assertion drives the new contract.
      expect(setVaultDefault).toHaveBeenCalledOnce();
      expect(setVaultDefault).toHaveBeenCalledWith(OPUS_MODEL, expect.anything());

      // writeCasting must NOT be called — Set-as-default is a vault-wide concern,
      // not a per-spell frontmatter write.
      expect(writeCasting).not.toHaveBeenCalled();
    });
  });

  // ── (b) Cast after a model change calls writeCasting with the new block ───

  describe('(b) Cast after model change calls writeCasting with the new block', () => {
    it('submitting cast after changing model to Opus calls writeCasting with provider:claude-code model:opus', async () => {
      const { contentEl, writeCasting } = mountPanelWithNewDeps({
        initialModel: SONNET_MODEL,
        // reader returns null = no existing block, so the block is "new"
        readerReturnValue: null,
      });

      const form = contentEl.querySelector('form.options-panel')!;
      const select = form.querySelector<HTMLSelectElement>('select')!;

      // Change model from Sonnet to Opus.
      select.value = 'opus';
      select.dispatchEvent(new Event('change'));

      // Submit cast.
      form.dispatchEvent(new Event('submit'));

      // Allow any promise microtasks to flush.
      await Promise.resolve();

      // RED: CastModelSection currently does not call writeCasting at all on Cast.
      // After F2 lands, it will call deps.writeCasting(spellPath, block) when the block
      // differs from reader(spellPath).
      expect(writeCasting).toHaveBeenCalledOnce();
      expect(writeCasting).toHaveBeenCalledWith(
        TEST_SPELL_PATH,
        expect.objectContaining({
          provider: 'claude-code',
          model: OPUS_MODEL,
        }),
      );
    });
  });

  // ── (c) Cast with no change does NOT call writeCasting ───────────────────

  describe('(c) Cast with no change skips writeCasting (block unchanged)', () => {
    it('submitting cast without changing model does not call writeCasting when reader returns matching block', async () => {
      // reader returns a block that matches the default form state (Sonnet/medium).
      const existingBlock: SpellCastingSettings = {
        provider: 'claude-code',
        model: SONNET_MODEL,
        effort: 'medium',
      };

      const { contentEl, writeCasting } = mountPanelWithNewDeps({
        initialModel: SONNET_MODEL,
        readerReturnValue: existingBlock,
      });

      const form = contentEl.querySelector('form.options-panel')!;

      // Submit cast without changing anything.
      form.dispatchEvent(new Event('submit'));

      await Promise.resolve();

      // The block hasn't changed, so writeCasting should NOT be called.
      // This serves as the baseline anchor — green even before F2 because writeCasting
      // isn't wired at all yet; it stays green after F2 because the block-changed guard
      // detects no difference and skips the write.
      expect(writeCasting).not.toHaveBeenCalled();
    });
  });

  // ── (d) Override dot lights when reader returns a block ──────────────────

  describe('(d) Override dot reflects reader output, not overrides store', () => {
    beforeEach(() => {
      // Reset any stale DOM nodes between tests in this group.
      document.querySelectorAll('[data-mock-modal]').forEach((el) => el.remove());
    });

    it('dot is present in a spell row when reader returns a casting block', () => {
      const blockForSpell: SpellCastingSettings = {
        provider: 'claude-code',
        model: OPUS_MODEL,
        effort: 'high',
      };

      // reader returns a block for every path (all spells have a local override).
      const harness = createPopupHarness({
        reader: vi.fn().mockReturnValue(blockForSpell),
      });

      // The spells panel is rendered on open; spell rows should be visible.
      const rows = harness.visibleSpellRows();
      expect(rows.length).toBeGreaterThan(0);

      const firstRow = rows[0]!;

      // RED: CommandPopup.#handleHasOverride currently calls overrides.has(path),
      // which returns false because no override is registered in the store.
      // After F3 it will call reader(path) !== null, which returns true here.
      const dot = firstRow.querySelector('.grimoire-override-dot');
      expect(dot).not.toBeNull();

      harness.modal.close();
    });

    it('dot is absent in a spell row when reader returns null', () => {
      // reader returns null for all paths (no local override).
      const harness = createPopupHarness({
        reader: vi.fn().mockReturnValue(null),
      });

      const rows = harness.visibleSpellRows();
      expect(rows.length).toBeGreaterThan(0);

      const firstRow = rows[0]!;

      // No block → dot must be absent (this half stays green before and after F3).
      const dot = firstRow.querySelector('.grimoire-override-dot');
      expect(dot).toBeNull();

      harness.modal.close();
    });
  });
});
