import type { App, Scope } from 'obsidian';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SupportedModel } from '../../domain/settings/Settings';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import { REFINE_SENTINEL_PATH } from '../../domain/spells/Spell';
import { resolveSpellOptions } from '../../domain/settings/spellOptionsResolver';
import { OptionsFormState } from '../options/OptionsFormState';
import type { OptionsFormSnapshot } from '../options/OptionsFormState';
import { OptionsPanel } from '../options/OptionsPanel';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';

/** Constructor params for RefineOptionsDetail. Mirrors SpellOptionsDetailParams minus `spell`. */
export interface RefineOptionsDetailParams {
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
}

/** Detail panel for the Refine sentinel's options: resolves defaults, builds form state, mounts OptionsPanel. */
export class RefineOptionsDetail {
  #panel!: OptionsPanel;

  render(params: RefineOptionsDetailParams): void {
    const resolved = this.#resolveOptions(params);
    const formState = this.#buildFormState(resolved, params);
    this.#panel = this.#createPanel(resolved, formState, params);
  }

  destroy(): void {
    this.#panel.destroy();
  }

  /** Resolves Refine sentinel options (model, effort) from defaults and overrides. */
  #resolveOptions(params: RefineOptionsDetailParams) {
    return resolveSpellOptions({
      spellPath: REFINE_SENTINEL_PATH,
      session: params.sessionMap,
      overrides: params.overrides,
      settings: {
        defaultModel: params.formDefaults.defaultModel,
        defaultEffort: params.formDefaults.defaultEffort,
        spellTag: '',
        cliCommand: '',
        binaryPath: '',
        forgeOutputFolder: '',
        vaultMountPath: '',
        executionMode: 'local',
        portalHost: '',
        portalPort: '',
        portalPath: '',
        portalAuthUser: '',
        portalAuthPassword: '',
      },
      models: params.models,
    });
  }

  /** Builds initial form state from resolved options and session context notes/follow-up. */
  #buildFormState(resolved: ReturnType<typeof resolveSpellOptions>, params: RefineOptionsDetailParams) {
    const sessionEntry = params.sessionMap.get(REFINE_SENTINEL_PATH);
    return new OptionsFormState({
      model: resolved.model,
      effort: resolved.effort,
      contextNotePaths: sessionEntry?.contextNotePaths ?? [],
      followUp: sessionEntry?.followUp ?? '',
      executeOnNote: false,
    });
  }

  /** Mounts OptionsPanel with Refine-specific configuration (no executeOnNote toggle). */
  #createPanel(resolved: ReturnType<typeof resolveSpellOptions>, formState: OptionsFormState, params: RefineOptionsDetailParams) {
    const snapshot = { model: resolved.model, effort: resolved.effort };
    const panel = new OptionsPanel(params.scope);
    panel.render(params.contentEl, formState, snapshot, {
      app: params.app,
      overrides: params.overrides,
      sessionMap: params.sessionMap,
      spellPath: REFINE_SENTINEL_PATH,
      onCast: params.onCast,
      onOverrideChanged: params.onOverrideChanged,
      onBack: params.onBack,
      showExecuteOnNote: false,
    });
    return panel;
  }
}
