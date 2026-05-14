import { Effort } from '../domain/settings/Settings';
import { buildCastArgs } from './buildCastArgs';
import { resolveCliBinary } from './resolveCliBinary';
import { CastExitInfo, CastSpawner, SpawnFn } from './spawnCast';

interface BaseCastRunInput {
  modelId: string;
  effort: Effort | null;
  vaultMountPath: string;
  binaryPath: string;
  cliCommand: string;
  castId: string;
}

interface InlineCastRunInput extends BaseCastRunInput {
  metaSpell: string;
  systemPromptFile?: never;
  userPrompt?: never;
}

interface FileCastRunInput extends BaseCastRunInput {
  metaSpell?: never;
  systemPromptFile: string;
  userPrompt: string;
}

export type CastRunInput = InlineCastRunInput | FileCastRunInput;

export interface CastRunCallbacks {
  onSuccess: () => void;
  onFailure: (msg: string) => void;
}

export class CastRunner {
  readonly #castSpawner: CastSpawner;

  constructor(spawner?: SpawnFn) {
    this.#castSpawner = new CastSpawner({ spawner });
  }

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
        env: { VAULT_MOUNT_PATH: input.vaultMountPath, CAST_ID: input.castId },
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
