import { type Spell } from '../domain/spells/Spell';
import { type Effort, type GrimoireSettings } from '../domain/settings/Settings';
import type { Caster } from '../execution/Caster';
import type { CastLogWriter } from '../castLog/CastLogWriter';

/**
 * Input payload for a spell cast request.
 */
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

/**
 * Dependency injection parameters for CastDispatcher.
 */
export interface CastDispatcherDeps {
  notify: (msg: string) => void;
  close: () => void;
  caster: () => Caster;
  logWriter: () => CastLogWriter;
  generateId?: () => string;
}

/**
 * Orchestrates spell casting: validates inputs, logs intent, delegates execution to a local or remote caster.
 * Caster and LogWriter are obtained from injected factories to enable test injection.
 */
export class CastDispatcher {
  readonly #notify: (msg: string) => void;
  readonly #close: () => void;
  readonly #caster: () => Caster;
  readonly #logWriter: () => CastLogWriter;
  readonly #generateId: () => string;

  constructor(deps: CastDispatcherDeps) {
    this.#notify = deps.notify;
    this.#close = deps.close;
    this.#caster = deps.caster;
    this.#logWriter = deps.logWriter;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  /**
   * Dispatch a spell cast request. Validates prerequisites, logs the cast intent, and queues execution.
   * Runs asynchronously; errors are surfaced via notify callback.
   */
  dispatch(input: CastDispatchInput): void {
    const { spell, model, effort, contextNotePaths, followUp, settings, activeFilePath } = input;
    const isRemote = settings.executionMode === 'remote';
    const logWriter = this.#logWriter();

    if (input.executeOnNote && activeFilePath === null) {
      this.#notify('Open a note to cast against');
      this.#close();
      return;
    }

    if (isRemote && settings.portalHost.trim() === '') {
      this.#notify('Configure portal host in settings before casting remotely.');
      return;
    }

    const castId = this.#generateId();
    const userPrompt = this.#buildUserPrompt(input.executeOnNote, settings.vaultMountPath, activeFilePath, contextNotePaths, followUp);

    logWriter
      .recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote: input.executeOnNote })
      .catch(console.error);

    const noticeText = isRemote ? `Casting '${spell.name}' on portal…` : `Casting '${spell.name}'…`;
    this.#notify(noticeText);
    this.#close();

    const caster = this.#caster();
    caster.cast(
      {
        castId,
        spellPath: spell.path,
        modelId: model,
        effort,
        userPrompt,
        systemPromptFile: isRemote ? undefined : `${settings.vaultMountPath}/${spell.path}`,
        vaultMountPath: settings.vaultMountPath,
      },
      {
        onAccepted: ({ jobId }) => {
          if (jobId !== undefined) {
            logWriter
              .recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote: input.executeOnNote, portalCastId: jobId })
              .catch(console.error);
          }
          if (!isRemote) this.#notify('Spell cast');
        },
        onFailure: (msg) => {
          logWriter.recordError({ castId, message: msg }).catch(console.error);
          this.#notify(isRemote ? msg : `Cast failed: ${msg}`);
        },
      },
    );
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
