import type { App, Scope } from 'obsidian';
import type { Spell } from '../../domain/spells/Spell';
import { REFINE_SENTINEL_PATH } from '../../domain/spells/Spell';
import type { SpellPath } from '../../domain/spells/SpellPath';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SupportedModel, Effort } from '../../domain/settings/Settings';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import type { Provider } from '../../domain/settings/Provider';
import { resolveSpellOptions } from '../../domain/settings/spellOptionsResolver';
import { resolveCastingForSpell } from '../../domain/settings/resolveCastingForSpell';
import { OptionsFormState } from '../options/OptionsFormState';
import type { OptionsFormSnapshot } from '../options/OptionsFormState';
import { OptionsPanel } from '../options/OptionsPanel';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';
import { getRefineSentinels } from '../../refine/refineSentinelScanner';
import type { RefineVariantSelectDeps } from '../options/RefineVariantSelect';
import type { CastingFrontmatterReader, CastingFrontmatterWriter } from '../../infra/castingFrontmatter';
import type { ModelId } from '../../domain/settings/ModelId';

/**
 * Discriminant that parameterizes OptionsDetail.
 *
 * - `{ kind: 'spell'; spell }` — wraps a user-authored spell; enables executeOnNote toggle.
 * - `{ kind: 'refine' }` — wraps the Refine sentinel; hides executeOnNote toggle.
 */
export type OptionsDetailKind =
  | { kind: 'spell'; spell: Spell }
  | { kind: 'refine' };

/** Params for {@link OptionsDetail.render}. Covers both spell and refine configurations. */
export interface OptionsDetailParams {
  contentEl: HTMLElement;
  scope: Scope;
  app: App;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  formDefaults: FormDefaults;
  models: readonly SupportedModel[];
  onBack: () => void;
  onCast: (snapshot: OptionsFormSnapshot) => void;
  onOverrideChanged: () => void;
  kind: OptionsDetailKind;
  /**
   * Reads spell-local casting settings from a spell file's frontmatter.
   * Used to seed the model/effort form controls when kind === 'spell'.
   */
  reader: CastingFrontmatterReader;
  /**
   * Writes spell-local casting settings to a spell file's frontmatter.
   * Called on Cast when the casting block has changed. Only meaningful for spell panels.
   * Optional — defaults to a no-op when omitted (e.g. tests that focus on other behavior).
   */
  writeCasting?: CastingFrontmatterWriter;
  /**
   * Writes vault-wide default model/effort to plugin settings.
   * Called when the user ticks "Set as default". Only meaningful for spell panels.
   * Optional — defaults to a no-op when omitted.
   */
  setVaultDefault?: (model: ModelId, effort: Effort | null) => void;
  /**
   * Vault-relative path of the settings-level active Refine spell.
   * Used to pre-select the variant dropdown when no per-session override is present.
   * null = built-in default. Only meaningful when kind === 'refine'.
   */
  settingsActiveRefinePath?: string | null;
  /** Called when the user clicks the Forge button to update the spell. Only passed for spell panels. */
  onForgeUpdate?: (spell: Spell) => void;
}

/**
 * Unified detail panel for spell/refine options.
 *
 * Parameterized by {@link OptionsDetailKind} — branches only on the three things
 * that differ between a spell and the Refine sentinel:
 * (a) the spell-path used for override/session lookup,
 * (b) the initial `executeOnNote` value,
 * (c) whether the executeOnNote toggle is shown.
 *
 * Replaces the former `SpellOptionsDetail` and `RefineOptionsDetail` near-clones.
 */
export class OptionsDetail {
  #panel!: OptionsPanel;

  render(params: OptionsDetailParams): void {
    const spellPath = params.kind.kind === 'spell' ? params.kind.spell.path : REFINE_SENTINEL_PATH;
    const resolved = this.#resolveOptions(spellPath, params);
    const formState = this.#buildFormState(spellPath, resolved, params);
    this.#panel = this.#createPanel(spellPath, resolved, formState, params);
  }

  destroy(): void {
    this.#panel.destroy();
  }

  /**
   * Dispatches to the appropriate resolution strategy based on `kind`:
   * - `spell` → reads frontmatter via `reader`, resolves via `resolveCastingForSpell`,
   *   then lets a session entry win if one exists.
   * - `refine` (sentinel) → falls through to the legacy `resolveSpellOptions` path
   *   which reads per-spell overrides from the data store.
   */
  #resolveOptions(spellPath: SpellPath, params: OptionsDetailParams) {
    if (params.kind.kind === 'spell') {
      return this.#resolveRealSpellCasting(spellPath, params);
    }
    return this.#resolveSentinelCasting(spellPath, params);
  }

  /** Resolves model/effort/provider for a real authored spell using frontmatter + session. */
  #resolveRealSpellCasting(spellPath: SpellPath, params: OptionsDetailParams): { model: ReturnType<typeof resolveSpellOptions>['model']; effort: ReturnType<typeof resolveSpellOptions>['effort']; provider: Provider } {
    const parsed = params.reader(spellPath);
    const { model, effort, provider } = resolveCastingForSpell({
      parsed,
      defaults: {
        defaultModel: params.formDefaults.defaultModel,
        defaultEffort: params.formDefaults.defaultEffort,
        defaultProvider: params.formDefaults.defaultProvider,
      },
      models: params.models,
      knownProvider: params.formDefaults.defaultProvider,
    });
    // Session tier-1 still wins — if a session entry exists it overrides frontmatter.
    const sessionEntry = params.sessionMap.get(spellPath);
    if (sessionEntry) {
      return { model: sessionEntry.model, effort: sessionEntry.effort, provider };
    }
    return { model, effort, provider };
  }

  /** Resolves model/effort/provider for the Refine sentinel via the data-store override path. */
  #resolveSentinelCasting(spellPath: SpellPath, params: OptionsDetailParams): { model: ReturnType<typeof resolveSpellOptions>['model']; effort: ReturnType<typeof resolveSpellOptions>['effort']; provider: Provider } {
    const resolved = resolveSpellOptions({
      spellPath,
      session: params.sessionMap,
      overrides: params.overrides,
      settings: {
        defaultModel: params.formDefaults.defaultModel,
        defaultEffort: params.formDefaults.defaultEffort,
      },
      models: params.models,
    });
    return { ...resolved, provider: params.formDefaults.defaultProvider };
  }

  #buildFormState(spellPath: SpellPath, resolved: ReturnType<typeof resolveSpellOptions> & { provider: Provider }, params: OptionsDetailParams) {
    const sessionEntry = params.sessionMap.get(spellPath);
    // executeOnNote: spell uses its own flag; refine sentinel never executes on a note.
    const executeOnNote =
      params.kind.kind === 'spell'
        ? (sessionEntry?.executeOnNote ?? params.kind.spell.executeOnNote)
        : false;
    return new OptionsFormState({
      model: resolved.model,
      effort: resolved.effort,
      provider: resolved.provider,
      contextNotePaths: sessionEntry?.contextNotePaths ?? [],
      followUp: sessionEntry?.followUp ?? '',
      executeOnNote,
    });
  }

  #createPanel(spellPath: SpellPath, resolved: ReturnType<typeof resolveSpellOptions> & { provider: Provider }, formState: OptionsFormState, params: OptionsDetailParams) {
    // showExecuteOnNote: spell panels show the toggle; refine panels hide it (sentinel has no note).
    const showExecuteOnNote = params.kind.kind === 'spell';
    const snapshot = { model: resolved.model, effort: resolved.effort };
    const refineVariantSelectDeps = this.#buildRefineVariantDeps(formState, params);

    let onForgeUpdate: (() => void) | undefined;
    if (params.kind.kind === 'spell' && params.onForgeUpdate) {
      const spell = params.kind.spell;
      const handler = params.onForgeUpdate;
      onForgeUpdate = () => handler(spell);
    }

    const panel = new OptionsPanel(params.scope);
    panel.render(params.contentEl, formState, snapshot, {
      app: params.app,
      sessionMap: params.sessionMap,
      spellPath,
      onCast: params.onCast,
      onOverrideChanged: params.onOverrideChanged,
      onBack: params.onBack,
      showExecuteOnNote,
      refineVariantSelectDeps,
      onForgeUpdate,
      writeCasting: params.writeCasting ?? (() => Promise.resolve()),
      reader: params.reader,
      setVaultDefault: params.setVaultDefault ?? (() => {}),
    });
    return panel;
  }

  #buildRefineVariantDeps(formState: OptionsFormState, params: OptionsDetailParams): RefineVariantSelectDeps | undefined {
    if (params.kind.kind !== 'refine') return undefined;
    const variants = getRefineSentinels(params.app);
    if (variants.length === 0) return undefined;
    return {
      variants,
      // Session override takes priority; fall through to settings default; null = built-in.
      initialPath: params.sessionMap.get(REFINE_SENTINEL_PATH)?.refinePathOverride ?? params.settingsActiveRefinePath ?? null,
      onChange: (path: string | null) => {
        const current = formState.snapshot();
        params.sessionMap.put(REFINE_SENTINEL_PATH, { ...current, refinePathOverride: path });
      },
    };
  }
}
