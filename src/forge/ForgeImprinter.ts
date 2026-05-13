// eslint-disable-next-line obsidianmd/no-nodejs-modules
import { randomUUID } from 'node:crypto';
import { GrimoireSettings } from "../domain/settings/Settings";
import { CastRunner } from "../cast/CastRunner";
import { CastLogStore } from "../castLog/store";
import { FORGE_SPELL_PATH } from "../castLog/types";
import { sanitiseSpellName } from "./sanitiseSpellName";
import { buildMetaSpell } from "./buildMetaSpell";
import { ForgeFormSnapshot } from "./ForgeFormSnapshot";

export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  castRunner: CastRunner;
  castLogStore: CastLogStore;
  generateId?: () => string;
}

export class ForgeImprinter {
  readonly #notify: (msg: string) => void;
  readonly #castRunner: CastRunner;
  readonly #castLogStore: CastLogStore;
  readonly #generateId: () => string;

  constructor(deps: ForgeImprinterDeps) {
    this.#notify = deps.notify;
    this.#castRunner = deps.castRunner;
    this.#castLogStore = deps.castLogStore;
    this.#generateId = deps.generateId ?? (() => randomUUID());
  }

  imprint(
    snapshot: ForgeFormSnapshot,
    settings: GrimoireSettings,
    close: () => void
  ): void {
    const sanitised = sanitiseSpellName(snapshot.name);
    if (sanitised === "") {
      this.#notify("Spell name is invalid after sanitisation");
      close();
      return;
    }

    const castId = this.#generateId();
    this.#castLogStore.recordCasted({
      castId,
      spellPath: FORGE_SPELL_PATH,
      model: snapshot.model,
      effort: snapshot.effort,
      contextNotes: [],
    }).catch(console.error);

    const metaSpell = this.getMetaSpell(snapshot, sanitised, settings);

    this.#notify(`Forging "${sanitised}"…`);
    close();

    this.runCasting(metaSpell, snapshot, settings, sanitised, castId);
  }

  private runCasting(
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

  private getMetaSpell(
    snapshot: ForgeFormSnapshot,
    sanitised: string,
    settings: GrimoireSettings
  ) {
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
