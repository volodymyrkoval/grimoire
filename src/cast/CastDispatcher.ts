import { type Spell } from '../domain/spells/Spell';
import { type Effort, type GrimoireSettings } from '../domain/settings/Settings';
import { type CastLogStore } from '../castLog/store';
import { CastRunner } from './CastRunner';
import { type SpawnFn } from './spawnCast';

export interface CastDispatchInput {
  spell: Spell;
  model: string;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  settings: GrimoireSettings;
  activeFilePath: string | null;
  executeOnNote: boolean;
}

export interface CastDispatcherDeps {
  notify: (msg: string) => void;
  close: () => void;
  castRunner?: CastRunner;
  spawner?: SpawnFn;
  castLogStore: CastLogStore;
  generateId?: () => string;
}

export class CastDispatcher {
  readonly #notify: (msg: string) => void;
  readonly #close: () => void;
  readonly #castRunner?: CastRunner;
  readonly #spawner?: SpawnFn;
  readonly #castLogStore: CastLogStore;
  readonly #generateId: () => string;

  constructor(deps: CastDispatcherDeps) {
    this.#notify = deps.notify;
    this.#close = deps.close;
    this.#castRunner = deps.castRunner;
    this.#spawner = deps.spawner;
    this.#castLogStore = deps.castLogStore;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  dispatch(input: CastDispatchInput): void {
    const { spell, model, effort, contextNotePaths, followUp, settings, activeFilePath } = input;

    if (input.executeOnNote && activeFilePath === null) {
      this.#notify('Open a note to cast against');
      this.#close();
      return;
    }

    const castId = this.#recordCast(spell, input, model, effort);

    const userPrompt = this.#buildUserPrompt(
      input.executeOnNote,
      settings.vaultMountPath,
      activeFilePath,
      contextNotePaths,
      followUp
    );

    this.#notify(`Casting '${spell.name}'…`);
    this.#close();

    const runner = this.#castRunner ?? new CastRunner(this.#spawner);
    runner.run(
      {
        systemPromptFile: `${settings.vaultMountPath}/${spell.path}`,
        userPrompt,
        modelId: model,
        effort,
        vaultMountPath: settings.vaultMountPath,
        binaryPath: settings.binaryPath,
        cliCommand: settings.cliCommand,
        castId,
      },
      {
        onSuccess: () => this.#notify('Spell cast'),
        onFailure: (msg) => {
          this.#castLogStore.recordError({ castId, message: msg }).catch(console.error);
          this.#notify('Cast failed: ' + msg);
        },
      }
    );
  }

  #recordCast(
    spell: Spell,
    input: CastDispatchInput,
    model: string,
    effort: Effort | null
  ) {
    const castId = this.#generateId();
    this.#castLogStore
      .recordCasted({
        castId,
        spellPath: spell.path,
        model,
        effort,
        contextNotes: [...input.contextNotePaths],
        followUp: input.followUp,
        executeOnNote: input.executeOnNote,
      })
      .catch(console.error);
    return castId;
  }

  #buildUserPrompt(
    executeOnNote: boolean,
    vaultMountPath: string,
    activeFilePath: string | null,
    contextNotePaths: readonly string[],
    followUp: string
  ): string {
    let prompt =
      executeOnNote && activeFilePath !== null
        ? `Execute this spell against the note at \`${vaultMountPath}/${activeFilePath}\`.`
        : 'Proceed with the execution according to the instructions';

    if (contextNotePaths.length > 0) {
      prompt += `${prompt.length > 0 ? ' ' : ''}Additional context notes: ${contextNotePaths.join(', ')}.`;
    }

    if (followUp.trim() !== '') {
      prompt += `${prompt.length > 0 ? ' ' : ''}Follow-up: ${followUp}`;
    }

    return prompt;
  }
}
