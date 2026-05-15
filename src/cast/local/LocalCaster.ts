import type { GrimoireSettings } from '../../domain/settings/Settings';
import type { Caster, CastInput, CastCallbacks } from '../../execution/Caster';
import { CastRunner } from './CastRunner';

/**
 * Caster implementation that executes spells locally via the forging CLI.
 * Adapts generic CastInput into LocalCaster-specific CastRunInput and delegates to CastRunner.
 */
export class LocalCaster implements Caster {
  readonly #runner: CastRunner;
  readonly #settings: GrimoireSettings;

  constructor({ runner, settings }: { runner?: CastRunner; settings: GrimoireSettings }) {
    this.#runner = runner ?? new CastRunner();
    this.#settings = settings;
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
          cliCommand: this.#settings.cliCommand,
          castId: input.castId,
        }
      : {
          metaSpell: input.userPrompt,
          modelId: input.modelId,
          effort: input.effort,
          vaultMountPath: input.vaultMountPath,
          binaryPath: this.#settings.binaryPath,
          cliCommand: this.#settings.cliCommand,
          castId: input.castId,
        };

    this.#runner.run(runInput, {
      onSuccess: () => callbacks.onAccepted({}),
      onFailure: (msg) => callbacks.onFailure(msg),
    });
  }
}
