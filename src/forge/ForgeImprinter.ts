import { GrimoireSettings } from '../domain/settings/Settings';
import { FORGE_SPELL_PATH } from '../domain/spells/SystemSpellPaths';
import { sanitiseSpellName } from './sanitiseSpellName';
import { buildForgeUserPrompt } from './buildForgeUserPrompt';
import { ForgeFormSnapshot } from './ForgeFormSnapshot';
import type { Caster } from '../execution/Caster';
import type { CastEventSink } from './CastEventSink';
import type { SpellImprinter } from './SpellImprinter';
import { resolveProviderAdapter } from '../cast/provider/resolveProviderAdapter';
import type { Logger } from '../infra/Logger';

/** Dependencies injected into ForgeImprinter, allowing optional ID generation override for testing. */
export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  caster: () => Caster;
  logWriter: () => CastEventSink;
  /** Returns the materialized forge spell paths: absolute for the local caster, vault-relative for the portal. */
  forgeSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  generateId?: () => string;
  /** Logger for diagnostic output. Optional — no-op when omitted. */
  logger?: Logger;
}

/** All values needed to call caster.cast and handle its callbacks, assembled once in imprint. */
interface DispatchContext {
  castId: string;
  sanitised: string;
  snapshot: ForgeFormSnapshot;
  settings: GrimoireSettings;
  isRemote: boolean;
}

/**
 * Orchestrates spell forging: validates input, builds the per-cast user prompt, logs the cast, and dispatches execution.
 * Handles both local and remote execution modes, with appropriate user notifications.
 * System-prompt content lives in the materialized forge.md file; the user prompt carries only the five per-cast values.
 */
export class ForgeImprinter implements SpellImprinter<ForgeFormSnapshot> {
  readonly #notify: (msg: string) => void;
  readonly #caster: () => Caster;
  readonly #logWriter: () => CastEventSink;
  readonly #forgeSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  readonly #generateId: () => string;
  readonly #logger: Logger | undefined;

  constructor(deps: ForgeImprinterDeps) {
    this.#notify = deps.notify;
    this.#caster = deps.caster;
    this.#logWriter = deps.logWriter;
    this.#forgeSpellPaths = deps.forgeSpellPaths;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
    this.#logger = deps.logger;
  }

  /**
   * Initiates spell forging from a form submission.
   * Validates remote config and name sanitisation, logs the initial cast record, and starts execution.
   */
  imprint(snapshot: ForgeFormSnapshot, settings: GrimoireSettings, close: () => void): void {
    const isRemote = settings.executionMode === 'remote';

    const configErr = this.#remoteConfigError(settings);
    if (configErr) { this.#notify(configErr); return; }

    const sanitised = sanitiseSpellName(snapshot.name);
    const nameErr = this.#spellNameError(sanitised);
    if (nameErr) { this.#notify(nameErr); close(); return; }

    const castId = this.#generateId();

    this.#recordCast(castId, snapshot);
    this.#notifyLaunch(sanitised, isRemote);
    close();

    this.#dispatchCast({ castId, sanitised, snapshot, settings, isRemote });
  }

  /** Returns the error message when remote mode is misconfigured, or undefined when config is valid. */
  #remoteConfigError(settings: GrimoireSettings): string | undefined {
    if (settings.executionMode === 'remote' && settings.portalHost.trim() === '') {
      return 'Configure portal host in settings before casting remotely.';
    }
    return undefined;
  }

  #spellNameError(sanitised: string): string | undefined {
    return sanitised === '' ? 'Spell name is invalid after sanitisation' : undefined;
  }

  #recordCast(castId: string, snapshot: ForgeFormSnapshot): void {
    this.#logWriter()
      .recordCasted({ castId, spellPath: FORGE_SPELL_PATH, model: snapshot.model, effort: snapshot.effort, contextNotes: [], provider: snapshot.provider })
      .catch((e) => this.#logger?.error('recordCasted failed', e));
  }

  #notifyLaunch(sanitised: string, isRemote: boolean): void {
    this.#notify(isRemote ? `Forging '${sanitised}' on portal…` : `Forging '${sanitised}'…`);
  }

  /** Invokes caster.cast and wires the onAccepted / onFailure callbacks. */
  #dispatchCast(ctx: DispatchContext): void {
    const { castId, sanitised, snapshot, settings } = ctx;
    const userPrompt = buildForgeUserPrompt({
      description: snapshot.description,
      name: sanitised,
      model: snapshot.model,
      effort: snapshot.effort,
      executeOnNote: snapshot.executeOnNote,
      provider: snapshot.provider,
    });
    const paths = this.#forgeSpellPaths();
    const caster = this.#caster();
    resolveProviderAdapter(snapshot.provider, this.#logger);
    caster.cast(
      {
        castId,
        spellPath: paths.vaultRelForPortal,
        modelId: snapshot.model,
        effort: snapshot.effort,
        userPrompt,
        systemPromptFile: paths.absForCaster,
        vaultMountPath: settings.vaultMountPath,
        provider: snapshot.provider,
      },
      {
        onAccepted: ({ jobId }) => this.#onCastAccepted(ctx, jobId),
        onFailure: (msg) => this.#onCastFailed(ctx, msg),
      },
    );
  }

  /** Logs the updated cast record with portalCastId when present, and notifies when running locally. */
  #onCastAccepted(ctx: DispatchContext, jobId: string | undefined): void {
    const { castId, sanitised, snapshot, isRemote } = ctx;
    if (jobId !== undefined) {
      this.#logWriter()
        .recordCasted({ castId, spellPath: FORGE_SPELL_PATH, model: snapshot.model, effort: snapshot.effort, contextNotes: [], portalCastId: jobId, provider: snapshot.provider })
        .catch((e) => this.#logger?.error('recordCasted failed', e));
    }
    if (!isRemote) this.#notify(`Spell "${sanitised}" forged`);
  }

  /** Logs the cast error and notifies the user with an appropriate message. */
  #onCastFailed(ctx: DispatchContext, msg: string): void {
    const { castId, isRemote } = ctx;
    this.#logWriter().recordError({ castId, message: msg }).catch((e) => this.#logger?.error('recordError failed', e));
    this.#notify(isRemote ? msg : `Forge failed: ${msg}`);
  }
}
