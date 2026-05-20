import { GrimoireSettings } from '../domain/settings/Settings';
import { FORGE_UPDATE_SPELL_PATH } from '../domain/spells/SystemSpellPaths';
import { buildForgeUpdateUserPrompt } from './buildForgeUpdateUserPrompt';
import { ForgeUpdateFormSnapshot } from './ForgeUpdateFormSnapshot';
import type { Caster } from '../execution/Caster';
import type { CastEventSink } from './CastEventSink';
import type { SpellImprinter } from './SpellImprinter';

/** Dependencies injected into ForgeUpdateImprinter, allowing optional ID generation override for testing. */
export interface ForgeUpdateImprinterDeps {
  notify: (msg: string) => void;
  caster: () => Caster;
  logWriter: () => CastEventSink;
  /** Returns the materialized forge-update spell paths: absolute for the local caster, vault-relative for the portal. */
  forgeUpdateSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  generateId?: () => string;
}

/** All values needed to call caster.cast and handle its callbacks, assembled once in imprint. */
interface DispatchContext {
  castId: string;
  snapshot: ForgeUpdateFormSnapshot;
  settings: GrimoireSettings;
  isRemote: boolean;
}

/**
 * Orchestrates spell update forging: builds the per-cast user prompt, logs the cast, and dispatches execution.
 * Handles both local and remote execution modes, with appropriate user notifications.
 * Unlike ForgeImprinter, there is no name-sanitisation step — the spell already exists.
 * The cast always runs with executeOnNote:true so Claude writes back to the spell file in place.
 */
export class ForgeUpdateImprinter implements SpellImprinter<ForgeUpdateFormSnapshot> {
  readonly #notify: (msg: string) => void;
  readonly #caster: () => Caster;
  readonly #logWriter: () => CastEventSink;
  readonly #forgeUpdateSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  readonly #generateId: () => string;

  constructor(deps: ForgeUpdateImprinterDeps) {
    this.#notify = deps.notify;
    this.#caster = deps.caster;
    this.#logWriter = deps.logWriter;
    this.#forgeUpdateSpellPaths = deps.forgeUpdateSpellPaths;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  imprint(snapshot: ForgeUpdateFormSnapshot, settings: GrimoireSettings, close: () => void): void {
    const isRemote = settings.executionMode === 'remote';

    const configErr = this.#remoteConfigError(settings);
    if (configErr) { this.#notify(configErr); return; }

    const castId = this.#generateId();
    this.#recordCast(castId, snapshot);
    this.#notifyLaunch(snapshot.spellName, isRemote);
    close();

    this.#dispatchCast({ castId, snapshot, settings, isRemote });
  }

  /** Returns the error message when remote mode is misconfigured, or undefined when config is valid. */
  #remoteConfigError(settings: GrimoireSettings): string | undefined {
    if (settings.executionMode === 'remote' && settings.portalHost.trim() === '') {
      return 'Configure portal host in settings before casting remotely.';
    }
    return undefined;
  }

  #recordCast(castId: string, snapshot: ForgeUpdateFormSnapshot, portalCastId?: string): void {
    this.#logWriter()
      .recordCasted({
        castId,
        spellPath: FORGE_UPDATE_SPELL_PATH,
        model: snapshot.model,
        effort: snapshot.effort,
        contextNotes: [],
        executeOnNote: true,
        ...(portalCastId !== undefined && { portalCastId }),
      })
      .catch(console.error);
  }

  #notifyLaunch(spellName: string, isRemote: boolean): void {
    this.#notify(isRemote ? `Updating '${spellName}' on portal…` : `Updating '${spellName}'…`);
  }

  /** Invokes caster.cast and wires the onAccepted / onFailure callbacks. */
  #dispatchCast(ctx: DispatchContext): void {
    const { castId, snapshot, settings } = ctx;
    const userPrompt = buildForgeUpdateUserPrompt({
      spellPath: snapshot.spellPath,
      spellName: snapshot.spellName,
      description: snapshot.description,
      applyCastDirectives: snapshot.applyCastDirectives,
      directiveCount: snapshot.directiveCount,
      model: snapshot.model,
      effort: snapshot.effort,
    });
    const paths = this.#forgeUpdateSpellPaths();
    this.#caster().cast(
      {
        castId,
        spellPath: paths.vaultRelForPortal,
        modelId: snapshot.model,
        effort: snapshot.effort,
        userPrompt,
        systemPromptFile: paths.absForCaster,
        vaultMountPath: settings.vaultMountPath,
        executeOnNote: true,
        activeFilePath: snapshot.spellPath,
      },
      {
        onAccepted: ({ jobId }) => this.#onCastAccepted(ctx, jobId),
        onFailure: (msg) => this.#onCastFailed(ctx, msg),
      },
    );
  }

  /** Logs the updated cast record with portalCastId when present, and notifies when running locally. */
  #onCastAccepted(ctx: DispatchContext, jobId: string | undefined): void {
    const { castId, snapshot, isRemote } = ctx;
    if (jobId !== undefined) {
      this.#recordCast(castId, snapshot, jobId);
    }
    if (!isRemote) this.#notify(`Spell '${snapshot.spellName}' updated`);
  }

  /** Logs the cast error and notifies the user with an appropriate message. */
  #onCastFailed(ctx: DispatchContext, msg: string): void {
    const { castId, isRemote } = ctx;
    this.#logWriter().recordError({ castId, message: msg }).catch(console.error);
    this.#notify(isRemote ? msg : `Forge update failed: ${msg}`);
  }
}
