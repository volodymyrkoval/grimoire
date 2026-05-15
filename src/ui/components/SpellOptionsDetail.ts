import type { App, Scope } from 'obsidian';
import type { Spell } from '../../domain/spells/Spell';
import type { SpellOverrideStore } from '../../domain/settings/SpellOverrideStore';
import type { SupportedModel } from '../../domain/settings/Settings';
import type { FormDefaults } from '../../domain/settings/FormDefaults';
import { resolveSpellOptions } from '../../domain/settings/spellOptionsResolver';
import { OptionsFormState } from '../options/OptionsFormState';
import type { OptionsFormSnapshot } from '../options/OptionsFormState';
import { OptionsPanel } from '../options/OptionsPanel';
import type { OptionsSessionMap } from '../options/OptionsSessionMap';

export interface SpellOptionsDetailParams {
  contentEl: HTMLElement;
  scope: Scope;
  spell: Spell;
  app: App;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  formDefaults: FormDefaults;
  models: readonly SupportedModel[];
  onBack: () => void;
  onCast: (snapshot: OptionsFormSnapshot) => void;
  onOverrideChanged: () => void;
}

/** Detail panel for a spell's options: resolves defaults, builds form state, mounts OptionsPanel. */
export class SpellOptionsDetail {
  readonly #panel: OptionsPanel;

  constructor(params: SpellOptionsDetailParams) {
    const resolved = this.#resolveOptions(params);
    const formState = this.#buildFormState(resolved, params);
    this.#panel = this.#createPanel(resolved, formState, params);
  }

  destroy(): void {
    this.#panel.destroy();
  }

  #resolveOptions(params: SpellOptionsDetailParams) {
    return resolveSpellOptions({
      spellPath: params.spell.path,
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

  #buildFormState(resolved: ReturnType<typeof resolveSpellOptions>, params: SpellOptionsDetailParams) {
    const sessionEntry = params.sessionMap.get(params.spell.path);
    return new OptionsFormState({
      model: resolved.model,
      effort: resolved.effort,
      contextNotePaths: sessionEntry?.contextNotePaths ?? [],
      followUp: sessionEntry?.followUp ?? '',
      executeOnNote: sessionEntry?.executeOnNote ?? params.spell.executeOnNote,
    });
  }

  #createPanel(resolved: ReturnType<typeof resolveSpellOptions>, formState: OptionsFormState, params: SpellOptionsDetailParams) {
    const snapshot = { model: resolved.model, effort: resolved.effort };
    return new OptionsPanel(params.contentEl, params.scope, formState, snapshot, {
      app: params.app,
      overrides: params.overrides,
      sessionMap: params.sessionMap,
      spellPath: params.spell.path,
      onCast: params.onCast,
      onOverrideChanged: params.onOverrideChanged,
      onBack: params.onBack,
    });
  }
}
