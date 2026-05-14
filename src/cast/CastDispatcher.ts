import { type Spell } from '../domain/spells/Spell';
import { type Effort, type GrimoireSettings } from '../domain/settings/Settings';
import { type CastLogStore } from '../castLog/store';
import { CastRunner } from './CastRunner';
import { type SpawnFn } from './spawnCast';
import { RemoteCastTransport } from './RemoteCastTransport';

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
  remoteTransport?: RemoteCastTransport;
  castLogStore: CastLogStore;
  generateId?: () => string;
}

export class CastDispatcher {
  readonly #notify: (msg: string) => void;
  readonly #close: () => void;
  readonly #castRunner?: CastRunner;
  readonly #spawner?: SpawnFn;
  readonly #remoteTransport?: RemoteCastTransport;
  readonly #castLogStore: CastLogStore;
  readonly #generateId: () => string;

  constructor(deps: CastDispatcherDeps) {
    this.#notify = deps.notify;
    this.#close = deps.close;
    this.#castRunner = deps.castRunner;
    this.#spawner = deps.spawner;
    this.#remoteTransport = deps.remoteTransport;
    this.#castLogStore = deps.castLogStore;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  dispatch(input: CastDispatchInput): void {
    const { spell, model, effort, contextNotePaths, followUp, settings, activeFilePath } = input;
    const executionMode = settings.executionMode;

    if (input.executeOnNote && activeFilePath === null) {
      this.#notify('Open a note to cast against');
      this.#close();
      return;
    }

    if (executionMode === 'remote' && settings.portalHost.trim() === '') {
      this.#notify('Configure portal host in settings before casting remotely.');
      return;
    }

    if (executionMode === 'remote') {
      this.#remoteDispatch(input);
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

  #remoteDispatch(input: CastDispatchInput): void {
    const { spell, model, effort, contextNotePaths, followUp, settings, activeFilePath } = input;
    const { executeOnNote } = input;

    const castId = this.#generateId();
    this.#castLogStore
      .recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote }, { remote: true })
      .catch(console.error);

    this.#notify(`Casting '${spell.name}' on portal…`);
    this.#close();

    const userPrompt = this.#buildUserPrompt(executeOnNote, settings.vaultMountPath, activeFilePath, contextNotePaths, followUp);

    if (!this.#remoteTransport) {
      this.#notify('Remote transport not configured');
      return;
    }

    this.#remoteTransport.run(
      {
        castId,
        spellPath: spell.path,
        userPrompt,
        modelId: model,
        effort,
        portalHost: settings.portalHost,
        portalPort: settings.portalPort,
        portalPath: settings.portalPath,
        portalAuthUser: settings.portalAuthUser,
        portalAuthPassword: settings.portalAuthPassword,
      },
      {
        onAccepted: ({ portalCastId }) => {
          this.#castLogStore
            .recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote, portalCastId }, { remote: true })
            .catch(console.error);
        },
        onFailure: (msg) => {
          this.#castLogStore.recordError({ castId, message: msg }, { remote: true }).catch(console.error);
          this.#notify(msg);
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
