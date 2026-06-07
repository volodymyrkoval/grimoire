/**
 * Integration test: OptionsDetail — CastingFrontmatterReader seam (E0).
 *
 * Seam: the boundary between OptionsDetail (parent) and the rendered OptionsPanel
 * it constructs. Specifically, the model <select> and effort segment values that
 * OptionsPanel receives are determined by how OptionsDetail resolves them —
 * currently from the SpellOverrideStore, eventually from a CastingFrontmatterReader.
 *
 * RED until E1 adds `reader: CastingFrontmatterReader` to `OptionsDetailParams` and
 * E2 threads it through DetailPanelRouterDeps. Until then, `OptionsDetail` ignores
 * the reader passed via the `as any` cast and falls back to global defaults
 * (Sonnet/medium), so cases (a) and (c) fail red.
 *
 * Three cases pinned here:
 *   (a) Present matching block  — reader returns { provider:'claude-code', model:'opus', effort:'high' }
 *       → model select seeded to opus, effort row seeded to high
 *   (b) Absent block            — reader returns null
 *       → model select seeded to global default (sonnet/medium)
 *   (c) Stale-provider block    — reader returns { provider:'openai', model:'opus', effort:'high' }
 *       → wholesale fallback to global default (sonnet/medium)
 */

import { App, Scope } from 'obsidian';
import { vi, describe, it, expect } from 'vitest';
import { OptionsDetail } from '../../src/ui/components/OptionsDetail';
import type { OptionsDetailParams } from '../../src/ui/components/OptionsDetail';
import { OptionsSessionMap } from '../../src/ui/options/OptionsSessionMap';
import { SpellOverrideStore } from '../../src/domain/settings/SpellOverrideStore';
import { SUPPORTED_MODELS } from '../../src/domain/settings/Settings';
import { modelId } from '../../src/domain/settings/ModelId';
import { spellPath } from '../../src/domain/spells/SpellPath';
import type { CastingFrontmatterReader } from '../../src/infra/castingFrontmatter';
import type { SpellCastingSettings } from '../../src/domain/settings/CastingSettings';
import { CLAUDE_CODE } from '../../src/domain/settings/Provider';

/** Global default seeded into every test: Sonnet + medium */
const GLOBAL_DEFAULT_MODEL = modelId('sonnet');
const GLOBAL_DEFAULT_EFFORT = 'medium' as const;

const TEST_SPELL_PATH = spellPath('/spells/fireball.md');

/**
 * Augmented params type that adds the not-yet-implemented `reader` dep.
 * Allows `as any` cast while keeping the intended shape explicit.
 */
type OptionsDetailParamsWithReader = OptionsDetailParams & {
  reader: CastingFrontmatterReader;
};

interface MountResult {
  contentEl: HTMLElement;
  detail: OptionsDetail;
}

/**
 * Mounts OptionsDetail with a real Scope, real session/override stores, and a
 * stubbed CastingFrontmatterReader. The `reader` param is passed via `as any`
 * because E1 has not yet added it to OptionsDetailParams.
 */
function mountDetail(reader: CastingFrontmatterReader): MountResult {
  const contentEl = document.createElement('div');
  const scope = new Scope();
  const app = new App() as any;
  const sessionMap = new OptionsSessionMap();
  const overrides = new SpellOverrideStore({
    data: { settings: {} as any, spellOverrides: {} },
    saver: { schedule: vi.fn() } as any,
  });

  const params: OptionsDetailParamsWithReader = {
    contentEl,
    scope,
    app,
    overrides,
    sessionMap,
    formDefaults: {
      defaultModel: GLOBAL_DEFAULT_MODEL,
      defaultEffort: GLOBAL_DEFAULT_EFFORT,
      defaultProvider: CLAUDE_CODE,
    },
    models: SUPPORTED_MODELS,
    onBack: vi.fn(),
    onCast: vi.fn(),
    onOverrideChanged: vi.fn(),
    kind: {
      kind: 'spell',
      spell: {
        name: 'Fireball',
        path: TEST_SPELL_PATH,
        description: '',
        executeOnNote: false,
        tags: [],
      },
    },
    reader,
  };

  const detail = new OptionsDetail();
  // Cast to `any` then to the real type: reader does not exist in OptionsDetailParams
  // until E1 lands. The behavior won't be wired, making cases (a) and (c) red.
  detail.render(params as any as OptionsDetailParams);

  return { contentEl, detail };
}

/** Reads the model <select> value from the rendered panel. */
function readModelSelectValue(contentEl: HTMLElement): string | null {
  const form = contentEl.querySelector('form.options-panel');
  if (!form) return null;
  const select = form.querySelector<HTMLSelectElement>('select');
  return select?.value ?? null;
}

/** Reads the currently-selected effort button text from the effort row. */
function readSelectedEffortText(contentEl: HTMLElement): string | null {
  const form = contentEl.querySelector('form.options-panel');
  if (!form) return null;
  const activeBtn = form.querySelector<HTMLButtonElement>(
    '.grimoire-effort-row .grimoire-segmented__btn.is-active',
  );
  return activeBtn?.textContent?.trim() ?? null;
}

// ─── Case (a): Present matching block ────────────────────────────────────────

describe('OptionsDetail seam — CastingFrontmatterReader', () => {
  it('(a) present matching block seeds model select to opus and effort to high', () => {
    const block: SpellCastingSettings = {
      provider: 'claude-code',
      model: modelId('opus'),
      effort: 'high',
    };
    const reader: CastingFrontmatterReader = vi.fn().mockReturnValue(block);

    const { contentEl, detail } = mountDetail(reader);

    // RED: until E1 wires the reader, OptionsDetail ignores it and seeds Sonnet.
    // This assertion drives the correct expected value (opus); test fails red.
    expect(readModelSelectValue(contentEl)).toBe('opus');
    expect(readSelectedEffortText(contentEl)).toBe('high');

    detail.destroy();
  });

  // ─── Case (b): Absent block ───────────────────────────────────────────────

  it('(b) absent block (reader returns null) seeds model select to global default sonnet/medium', () => {
    const reader: CastingFrontmatterReader = vi.fn().mockReturnValue(null);

    const { contentEl, detail } = mountDetail(reader);

    // GREEN even before E1: global default (sonnet/medium) is what OptionsDetail
    // returns when no override exists. This case serves as the baseline anchor.
    expect(readModelSelectValue(contentEl)).toBe('sonnet');
    expect(readSelectedEffortText(contentEl)).toBe('medium');

    detail.destroy();
  });

  // ─── Case (c): Stale-provider block ──────────────────────────────────────

  it('(c) stale-provider block (provider:openai) wholesale-falls back to global default sonnet/medium', () => {
    // The frontmatter block names a provider that is not claude-code → stale → wholesale fallback.
    const staleBlock: SpellCastingSettings = {
      provider: 'openai',
      model: modelId('opus'),
      effort: 'high',
    };
    const reader: CastingFrontmatterReader = vi.fn().mockReturnValue(staleBlock);

    const { contentEl, detail } = mountDetail(reader);

    // GREEN even before E1: OptionsDetail ignores the reader and returns global default.
    // After E1 lands the resolver runs, stale provider triggers wholesale fallback — same outcome.
    // This test stays green through both phases (it is not a red test for the stale-block logic;
    // it is an anchor that proves the stale path never bleeds opus through).
    expect(readModelSelectValue(contentEl)).toBe('sonnet');
    expect(readSelectedEffortText(contentEl)).toBe('medium');

    detail.destroy();
  });
});
