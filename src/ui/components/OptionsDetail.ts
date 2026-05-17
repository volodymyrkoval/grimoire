import type { App, Scope } from 'obsidian';
import type { Spell } from '../../domain/spells/Spell';
import { REFINE_SENTINEL_PATH } from '../../domain/spells/Spell';
import type { SpellPath } from '../../domain/spells/SpellPath';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SupportedModel } from '../../domain/settings/Settings';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import { resolveSpellOptions } from '../../domain/settings/spellOptionsResolver';
import { OptionsFormState } from '../options/OptionsFormState';
import type { OptionsFormSnapshot } from '../options/OptionsFormState';
import { OptionsPanel } from '../options/OptionsPanel';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';

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

  #resolveOptions(spellPath: SpellPath, params: OptionsDetailParams) {
    return resolveSpellOptions({
      spellPath,
      session: params.sessionMap,
      overrides: params.overrides,
      settings: {
        defaultModel: params.formDefaults.defaultModel,
        defaultEffort: params.formDefaults.defaultEffort,
      },
      models: params.models,
    });
  }

  #buildFormState(spellPath: SpellPath, resolved: ReturnType<typeof resolveSpellOptions>, params: OptionsDetailParams) {
    const sessionEntry = params.sessionMap.get(spellPath);
    // executeOnNote: spell uses its own flag; refine sentinel never executes on a note.
    const executeOnNote =
      params.kind.kind === 'spell'
        ? (sessionEntry?.executeOnNote ?? params.kind.spell.executeOnNote)
        : false;
    return new OptionsFormState({
      model: resolved.model,
      effort: resolved.effort,
      contextNotePaths: sessionEntry?.contextNotePaths ?? [],
      followUp: sessionEntry?.followUp ?? '',
      executeOnNote,
    });
  }

  #createPanel(spellPath: SpellPath, resolved: ReturnType<typeof resolveSpellOptions>, formState: OptionsFormState, params: OptionsDetailParams) {
    // showExecuteOnNote: spell panels show the toggle; refine panels hide it (sentinel has no note).
    const showExecuteOnNote = params.kind.kind === 'spell';
    const snapshot = { model: resolved.model, effort: resolved.effort };
    const panel = new OptionsPanel(params.scope);
    panel.render(params.contentEl, formState, snapshot, {
      app: params.app,
      overrides: params.overrides,
      sessionMap: params.sessionMap,
      spellPath,
      onCast: params.onCast,
      onOverrideChanged: params.onOverrideChanged,
      onBack: params.onBack,
      showExecuteOnNote,
    });
    return panel;
  }
}
