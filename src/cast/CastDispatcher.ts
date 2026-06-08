import { type Spell } from '../domain/spells/Spell';
import { type Effort, type GrimoireSettings } from '../domain/settings/Settings';
import type { Caster } from '../execution/Caster';
import type { CastResultRecorder } from './CastResultRecorder';
import type { ModelId } from '../domain/settings/ModelId';
import type { Provider } from '../domain/settings/Provider';
import { resolveProviderAdapter } from './provider/resolveProviderAdapter';
import type { Logger } from '../infra/Logger';

/**
 * Input payload for a spell cast request.
 */
export interface CastDispatchInput {
  spell: Spell;
  model: ModelId;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  settings: GrimoireSettings;
  activeFilePath: string | null;
  executeOnNote: boolean;
  /**
   * Optional explicit system-prompt file path. When present, used directly as
   * `systemPromptFile` (local) and as `spellPath` (remote, so the portal reads
   * the file from the vault). Overrides the default `vaultMountPath/spell.path`
   * computation. Used by Refine cast (where spell.path is the cast-log sentinel
   * `<refine>`, not a real vault path). Live spells and forge cast leave this
   * undefined and use the standard computation.
   */
  readonly systemPromptFilePath?: string;
  /** The provider used to execute this cast. */
  readonly provider: Provider;
}

/**
 * Dependency injection parameters for CastDispatcher.
 */
export interface CastDispatcherDeps {
  notify: (msg: string) => void;
  close: () => void;
  caster: () => Caster;
  logWriter: () => CastResultRecorder;
  generateId?: () => string;
  /** Logger for diagnostic output. Optional — no-op when omitted. */
  logger?: Logger;
}

/**
 * Orchestrates spell casting: validates inputs, logs intent, delegates execution to a local or remote caster.
 * Caster and LogWriter are obtained from injected factories to enable test injection.
 */
export class CastDispatcher {
  readonly #notify: (msg: string) => void;
  readonly #close: () => void;
  readonly #caster: () => Caster;
  readonly #logWriter: () => CastResultRecorder;
  readonly #generateId: () => string;
  readonly #logger: Logger | undefined;

  constructor(deps: CastDispatcherDeps) {
    this.#notify = deps.notify;
    this.#close = deps.close;
    this.#caster = deps.caster;
    this.#logWriter = deps.logWriter;
    this.#generateId = deps.generateId ?? (() => crypto.randomUUID());
    this.#logger = deps.logger;
  }

  /**
   * Dispatch a spell cast request. Validates prerequisites, logs the cast intent, and queues execution.
   * Runs asynchronously; errors are surfaced via notify callback.
   */
  dispatch(input: CastDispatchInput): void {
    const { spell, model, effort, contextNotePaths, followUp, settings, activeFilePath, provider } = input;
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
    const providerAdapter = resolveProviderAdapter(provider, this.#logger);

    logWriter
      .recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote: input.executeOnNote, provider })
      .catch((e) => this.#logger?.error('recordCasted failed', e));

    const noticeText = isRemote ? `Casting '${spell.name}' on portal…` : `Casting '${spell.name}'…`;
    this.#notify(noticeText);
    this.#close();

    const caster = this.#caster();
    caster.cast(
      {
        castId,
        spellPath: input.systemPromptFilePath ?? spell.path,
        modelId: model,
        effort,
        userPrompt,
        systemPromptFile: isRemote ? undefined : (input.systemPromptFilePath ?? `${settings.vaultMountPath}/${spell.path}`),
        vaultMountPath: settings.vaultMountPath,
        provider,
      },
      {
        onAccepted: ({ jobId }) => {
          if (jobId !== undefined) {
            logWriter
              .recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote: input.executeOnNote, portalCastId: jobId, provider })
              .catch((e) => this.#logger?.error('recordCasted failed', e));
          }
          if (!isRemote) this.#notify('Spell cast');
        },
        onFailure: (msg) => {
          logWriter.recordError({ castId, message: msg }).catch((e) => this.#logger?.error('recordError failed', e));
          this.#notify(isRemote ? msg : `Cast failed: ${msg}`);
        },
      },
    );

    void providerAdapter; // TODO: wire to caster routing when a second provider is added
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
