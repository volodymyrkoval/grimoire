import { GrimoireSettings } from '../domain/settings/Settings';
import { FORGE_SPELL_PATH } from '../castLog/types';
import { sanitiseSpellName } from './sanitiseSpellName';
import { buildMetaSpell } from './buildMetaSpell';
import { ForgeFormSnapshot } from './ForgeFormSnapshot';
import type { Caster } from '../execution/Caster';
import type { CastLogWriter } from '../castLog/CastLogWriter';

export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  caster: () => Caster;
  logWriter: () => CastLogWriter;
  generateId?: () => string;
}

export class ForgeImprinter {
  readonly #notify: (msg: string) => void;
  readonly #caster: () => Caster;
  readonly #logWriter: () => CastLogWriter;
  readonly #generateId: () => string;

  constructor(deps: ForgeImprinterDeps) {
    this.#notify = deps.notify;
    this.#caster = deps.caster;
    this.#logWriter = deps.logWriter;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  imprint(snapshot: ForgeFormSnapshot, settings: GrimoireSettings, close: () => void): void {
    const isRemote = settings.executionMode === 'remote';
    const logWriter = this.#logWriter();

    // pre-flight guard 1: empty portal host
    if (isRemote && settings.portalHost.trim() === '') {
      this.#notify('Configure portal host in settings before casting remotely.');
      return;
    }

    // pre-flight guard 2: invalid spell name
    const sanitised = sanitiseSpellName(snapshot.name);
    if (sanitised === '') {
      this.#notify('Spell name is invalid after sanitisation');
      close();
      return;
    }

    const castId = this.#generateId();
    const metaSpell = buildMetaSpell({
      description: snapshot.description,
      name: sanitised,
      model: snapshot.model,
      effort: snapshot.effort,
      spellTag: settings.spellTag,
      forgeOutputFolder: settings.forgeOutputFolder,
      vaultMountPath: settings.vaultMountPath,
      executeOnNote: snapshot.executeOnNote,
    });

    logWriter
      .recordCasted({ castId, spellPath: FORGE_SPELL_PATH, model: snapshot.model, effort: snapshot.effort, contextNotes: [] })
      .catch(console.error);

    const noticeText = isRemote ? `Forging '${sanitised}' on portal…` : `Forging '${sanitised}'…`;
    this.#notify(noticeText);
    close();

    const caster = this.#caster();
    caster.cast(
      {
        castId,
        spellPath: FORGE_SPELL_PATH,
        modelId: snapshot.model,
        effort: snapshot.effort,
        userPrompt: metaSpell,
        systemPromptFile: undefined,
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
