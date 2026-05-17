import { GrimoireSettings } from '../domain/settings/Settings';
import { FORGE_SPELL_PATH } from '../domain/spells/SystemSpellPaths';
import { sanitiseSpellName } from './sanitiseSpellName';
import { buildForgeUserPrompt } from './buildForgeUserPrompt';
import { ForgeFormSnapshot } from './ForgeFormSnapshot';
import type { Caster } from '../execution/Caster';
import type { CastEventSink } from './CastEventSink';

/** Dependencies injected into ForgeImprinter, allowing optional ID generation override for testing. */
export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  caster: () => Caster;
  logWriter: () => CastEventSink;
  /** Returns the materialized forge spell paths: absolute for the local caster, vault-relative for the portal. */
  forgeSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  generateId?: () => string;
}

/**
 * Orchestrates spell forging: validates input, builds the per-cast user prompt, logs the cast, and dispatches execution.
 * Handles both local and remote execution modes, with appropriate user notifications.
 * System-prompt content lives in the materialized forge.md file; the user prompt carries only the five per-cast values.
 */
export class ForgeImprinter {
  readonly #notify: (msg: string) => void;
  readonly #caster: () => Caster;
  readonly #logWriter: () => CastEventSink;
  readonly #forgeSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  readonly #generateId: () => string;

  constructor(deps: ForgeImprinterDeps) {
    this.#notify = deps.notify;
    this.#caster = deps.caster;
    this.#logWriter = deps.logWriter;
    this.#forgeSpellPaths = deps.forgeSpellPaths;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  /**
   * Initiates spell forging from a form submission.
   * Validates name sanitisation, logs the initial cast record, and starts execution.
   */
  imprint(snapshot: ForgeFormSnapshot, settings: GrimoireSettings, close: () => void): void {
    const isRemote = settings.executionMode === 'remote';
    const logWriter = this.#logWriter();

    if (isRemote && settings.portalHost.trim() === '') {
      this.#notify('Configure portal host in settings before casting remotely.');
      return;
    }

    const sanitised = sanitiseSpellName(snapshot.name);
    if (sanitised === '') {
      this.#notify('Spell name is invalid after sanitisation');
      close();
      return;
    }

    const castId = this.#generateId();
    const userPrompt = buildForgeUserPrompt({
      description: snapshot.description,
      name: sanitised,
      model: snapshot.model,
      effort: snapshot.effort,
      executeOnNote: snapshot.executeOnNote,
    });

    logWriter
      .recordCasted({ castId, spellPath: FORGE_SPELL_PATH, model: snapshot.model, effort: snapshot.effort, contextNotes: [] })
      .catch(console.error);

    const noticeText = isRemote ? `Forging '${sanitised}' on portal…` : `Forging '${sanitised}'…`;
    this.#notify(noticeText);
    close();

    const paths = this.#forgeSpellPaths();
    const caster = this.#caster();
    caster.cast(
      {
        castId,
        spellPath: paths.vaultRelForPortal,
        modelId: snapshot.model,
        effort: snapshot.effort,
        userPrompt,
        systemPromptFile: paths.absForCaster,
        vaultMountPath: settings.vaultMountPath,
      },
      {
        onAccepted: ({ jobId }) => {
          if (jobId !== undefined) {
            logWriter
              .recordCasted({ castId, spellPath: FORGE_SPELL_PATH, model: snapshot.model, effort: snapshot.effort, contextNotes: [], portalCastId: jobId })
              .catch(console.error);
          }
          if (!isRemote) this.#notify(`Spell "${sanitised}" forged`);
        },
        onFailure: (msg) => {
          logWriter.recordError({ castId, message: msg }).catch(console.error);
          this.#notify(isRemote ? msg : `Forge failed: ${msg}`);
        },
      },
    );
  }
}
