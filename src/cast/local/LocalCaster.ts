import type { GrimoireSettings } from '../../domain/settings/Settings';
import type { Caster, CastInput, CastCallbacks } from '../../execution/Caster';
import { CastRunner } from './CastRunner';
import type { Logger } from '../../infra/Logger';

/**
 * Caster implementation that executes spells locally via the forging CLI.
 * Adapts generic CastInput into LocalCaster-specific CastRunInput and delegates to CastRunner.
 */
export class LocalCaster implements Caster {
  readonly #runner: CastRunner;
  readonly #settings: GrimoireSettings;
  readonly #claudeHooksDirAbs: string | undefined;
  // eslint-disable-next-line no-unused-private-class-members
  readonly #logger: Logger | undefined;

  constructor({ runner, settings, claudeHooksDirAbs, logger }: { runner?: CastRunner; settings: GrimoireSettings; claudeHooksDirAbs?: string; logger?: Logger }) {
    this.#runner = runner ?? new CastRunner(undefined, logger);
    this.#settings = settings;
    this.#claudeHooksDirAbs = claudeHooksDirAbs;
    this.#logger = logger;
  }

  /**
   * Execute a spell cast locally by preparing arguments and spawning the CLI process.
   */
  cast(input: CastInput, callbacks: CastCallbacks): void {
    const runInput = input.systemPromptFile
      ? {
          systemPromptFile: input.systemPromptFile,
          userPrompt: input.userPrompt,
          modelId: input.modelId,
          effort: input.effort,
          vaultMountPath: input.vaultMountPath,
          binaryPath: this.#settings.binaryPath,
          mcpConfigPath: this.#settings.mcpConfigPath,
          castId: input.castId,
          claudeHooksDir: this.#claudeHooksDirAbs,
          echoOutput: this.#settings.showCastOutput,
        }
      : {
          metaSpell: input.userPrompt,
          modelId: input.modelId,
          effort: input.effort,
          vaultMountPath: input.vaultMountPath,
          binaryPath: this.#settings.binaryPath,
          mcpConfigPath: this.#settings.mcpConfigPath,
          castId: input.castId,
          claudeHooksDir: this.#claudeHooksDirAbs,
          echoOutput: this.#settings.showCastOutput,
        };

    this.#runner.run(runInput, {
      onSuccess: () => callbacks.onAccepted({}),
      onFailure: (msg) => callbacks.onFailure(msg),
    });
  }
}
