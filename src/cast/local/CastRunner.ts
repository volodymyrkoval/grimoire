import { Effort } from '../../domain/settings/Settings';
import { buildCastArgs } from './buildCastArgs';
import { resolveCliBinary } from './resolveCliBinary';
import { CastExitInfo, CastSpawner, SpawnFn } from './spawnCast';

/**
 * Base fields common to both inline and file-based cast runs.
 */
interface BaseCastRunInput {
  modelId: string;
  effort: Effort | null;
  vaultMountPath: string;
  binaryPath: string;
  cliCommand: string;
  castId: string;
  claudeHooksDir?: string;
}

/**
 * Input for an inline (meta-spell) cast run.
 */
interface InlineCastRunInput extends BaseCastRunInput {
  metaSpell: string;
  systemPromptFile?: never;
  userPrompt?: never;
}

/**
 * Input for a file-based cast run.
 */
interface FileCastRunInput extends BaseCastRunInput {
  metaSpell?: never;
  systemPromptFile: string;
  userPrompt: string;
}

/**
 * Union of valid cast run inputs — either inline or file-based.
 */
export type CastRunInput = InlineCastRunInput | FileCastRunInput;

/**
 * Callbacks fired when a cast run completes or fails.
 */
export interface CastRunCallbacks {
  onSuccess: () => void;
  onFailure: (msg: string) => void;
}

/**
 * Spawns a local cast process (the forging CLI), manages its lifecycle, and reports the result.
 * Combines CLI argument construction, binary resolution, and process spawning into a single responsibility.
 */
export class CastRunner {
  readonly #castSpawner: CastSpawner;

  constructor(spawner?: SpawnFn) {
    this.#castSpawner = new CastSpawner({ spawner });
  }

  /**
   * Execute a cast by spawning the CLI process asynchronously.
   * Resolves the binary path, constructs arguments, spawns the process, and reports success/failure via callbacks.
   */
  run(input: CastRunInput, callbacks: CastRunCallbacks): void {
    const binary = this.#getPathToBinary(input);
    const args = this.#getCastArgs(input);

    this.#spawnCast(binary, args, input, callbacks);
  }

  #spawnCast(
    binary: string,
    args: string[],
    input: CastRunInput,
    callbacks: CastRunCallbacks
  ) {
    void this.#castSpawner
      .run({
        binary,
        args,
        // CAST_ID is opaque to the runner; producers guarantee uniqueness
        env: {
          VAULT_MOUNT_PATH: input.vaultMountPath,
          CAST_ID: input.castId,
          ...(input.claudeHooksDir ? { CLAUDE_HOOKS_DIR: input.claudeHooksDir } : {}),
        },
        cwd: input.vaultMountPath,
      })
      .then(this.#onCastExit(callbacks))
      .catch(this.#onCastError(callbacks));
  }

  #onCastExit(callbacks: CastRunCallbacks) {
    return ({ code, stderrTail, error }: CastExitInfo) => {
      if (code === 0) {
        callbacks.onSuccess();
      } else {
        callbacks.onFailure(error?.message ?? (stderrTail || `exit ${code}`));
      }
    };
  }

  #onCastError(callbacks: CastRunCallbacks) {
    return (err: Error) => {
      console.error(err);
      callbacks.onFailure(err.message);
    };
  }

  #getCastArgs(input: CastRunInput) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { binaryPath, cliCommand, castId: _castId, ...castArgsInput } = input;
    return buildCastArgs(castArgsInput);
  }

  #getPathToBinary(input: CastRunInput) {
    return resolveCliBinary({
      binaryPath: input.binaryPath,
      cliCommand: input.cliCommand,
    });
  }
}
