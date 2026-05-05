import { GrimoireSettings } from "../domain/settings/Settings";
import { CastRunner } from "../cast/CastRunner";
import { sanitiseSpellName } from "./sanitiseSpellName";
import { buildMetaSpell } from "./buildMetaSpell";
import { ForgeFormSnapshot } from "./ForgeFormSnapshot";

export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  castRunner: CastRunner;
}

export class ForgeImprinter {
  readonly #notify: (msg: string) => void;
  readonly #castRunner: CastRunner;

  constructor(deps: ForgeImprinterDeps) {
    this.#notify = deps.notify;
    this.#castRunner = deps.castRunner;
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

    const metaSpell = this.getMetaSpell(snapshot, sanitised, settings);

    this.#notify(`Forging "${sanitised}"…`);
    close();

    this.runCasting(metaSpell, snapshot, settings, sanitised);
  }

  private runCasting(
    metaSpell: string,
    snapshot: ForgeFormSnapshot,
    settings: GrimoireSettings,
    sanitised: string
  ) {
    this.#castRunner.run(
      {
        metaSpell,
        modelId: snapshot.model,
        effort: snapshot.effort,
        vaultMountPath: settings.vaultMountPath,
        binaryPath: settings.binaryPath,
        cliCommand: settings.cliCommand,
      },
      {
        onSuccess: () => {
          this.#notify(`Spell "${sanitised}" forged`);
        },
        onFailure: (msg) => this.#notify(`Forge failed: ${msg}`),
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
    });
  }
}
