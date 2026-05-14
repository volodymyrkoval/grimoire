import { GrimoireSettings } from '../domain/settings/Settings';
import { CastRunner } from '../cast/CastRunner';
import { CastLogStore } from '../castLog/store';
import { FORGE_SPELL_PATH } from '../castLog/types';
import { sanitiseSpellName } from './sanitiseSpellName';
import { buildMetaSpell } from './buildMetaSpell';
import { ForgeFormSnapshot } from './ForgeFormSnapshot';
import { RemoteCastTransport } from '../cast/RemoteCastTransport';

export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  castRunner: CastRunner;
  castLogStore: CastLogStore;
  generateId?: () => string;
  remoteTransport?: RemoteCastTransport;
}

export class ForgeImprinter {
  readonly #notify: (msg: string) => void;
  readonly #castRunner: CastRunner;
  readonly #castLogStore: CastLogStore;
  readonly #generateId: () => string;
  readonly #remoteTransport?: RemoteCastTransport;

  constructor(deps: ForgeImprinterDeps) {
    this.#notify = deps.notify;
    this.#castRunner = deps.castRunner;
    this.#castLogStore = deps.castLogStore;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
    this.#remoteTransport = deps.remoteTransport;
  }

  imprint(snapshot: ForgeFormSnapshot, settings: GrimoireSettings, close: () => void): void {
    const executionMode = settings.executionMode;

    // Pre-dispatch guard: remote mode with empty host
    if (executionMode === 'remote' && settings.portalHost.trim() === '') {
      this.#notify('Configure portal host in settings before casting remotely.');
      return;
    }

    const sanitised = sanitiseSpellName(snapshot.name);
    if (sanitised === '') {
      this.#notify('Spell name is invalid after sanitisation');
      close();
      return;
    }

    if (executionMode === 'remote') {
      this.#remoteImprint(snapshot, settings, sanitised, close);
      return;
    }

    const castId = this.#recordCast(snapshot);

    const metaSpell = this.#getMetaSpell(snapshot, sanitised, settings);

    this.#notify(`Forging '${sanitised}'…`);
    close();

    this.#runCasting(metaSpell, snapshot, settings, sanitised, castId);
  }

  #remoteImprint(
    snapshot: ForgeFormSnapshot,
    settings: GrimoireSettings,
    sanitised: string,
    close: () => void
  ): void {
    const castId = this.#generateId();

    this.#castLogStore
      .recordCasted(
        {
          castId,
          spellPath: FORGE_SPELL_PATH,
          model: snapshot.model,
          effort: snapshot.effort,
          contextNotes: [],
        },
        { remote: true }
      )
      .catch(console.error);

    const metaSpell = this.#getMetaSpell(snapshot, sanitised, settings);

    this.#notify(`Forging '${sanitised}' on portal…`);
    close();

    const onAccepted = ({ portalCastId }: { portalCastId: string }) => {
      this.#castLogStore
        .recordCasted(
          {
            castId,
            spellPath: FORGE_SPELL_PATH,
            model: snapshot.model,
            effort: snapshot.effort,
            contextNotes: [],
            portalCastId,
          },
          { remote: true }
        )
        .catch(console.error);
    };

    const onFailure = (msg: string) => {
      this.#castLogStore.recordError({ castId, message: msg }, { remote: true }).catch(console.error);
      this.#notify(msg);
    };

    if (!this.#remoteTransport) {
      this.#notify('Remote transport not configured');
      return;
    }

    this.#remoteTransport.run(
      {
        castId,
        spellPath: FORGE_SPELL_PATH,
        userPrompt: metaSpell,
        modelId: snapshot.model,
        effort: snapshot.effort,
        portalHost: settings.portalHost,
        portalPort: settings.portalPort,
        portalPath: settings.portalPath,
        portalAuthUser: settings.portalAuthUser,
        portalAuthPassword: settings.portalAuthPassword,
      },
      { onAccepted, onFailure }
    );
  }

  #runCasting(
    metaSpell: string,
    snapshot: ForgeFormSnapshot,
    settings: GrimoireSettings,
    sanitised: string,
    castId: string
  ) {
    this.#castRunner.run(
      {
        metaSpell,
        modelId: snapshot.model,
        effort: snapshot.effort,
        vaultMountPath: settings.vaultMountPath,
        binaryPath: settings.binaryPath,
        cliCommand: settings.cliCommand,
        castId,
      },
      {
        onSuccess: () => {
          this.#notify(`Spell "${sanitised}" forged`);
        },
        onFailure: (msg) => {
          this.#castLogStore.recordError({ castId, message: msg }).catch(console.error);
          this.#notify(`Forge failed: ${msg}`);
        },
      }
    );
  }

  #recordCast(snapshot: ForgeFormSnapshot) {
    const castId = this.#generateId();
    this.#castLogStore
      .recordCasted({
        castId,
        spellPath: FORGE_SPELL_PATH,
        model: snapshot.model,
        effort: snapshot.effort,
        contextNotes: [],
      })
      .catch(console.error);

    return castId;
  }

  #getMetaSpell(snapshot: ForgeFormSnapshot, sanitised: string, settings: GrimoireSettings) {
    return buildMetaSpell({
      description: snapshot.description,
      name: sanitised,
      model: snapshot.model,
      effort: snapshot.effort,
      spellTag: settings.spellTag,
      forgeOutputFolder: settings.forgeOutputFolder,
      vaultMountPath: settings.vaultMountPath,
      executeOnNote: snapshot.executeOnNote,
    });
  }
}
