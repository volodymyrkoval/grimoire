import { Effort } from '../../domain/settings/Settings';

/**
 * Base fields common to both inline and file-based cast arguments.
 */
interface BaseCastArgsInput {
  modelId: string;
  effort: Effort | null;
  vaultMountPath: string;
}

/**
 * Arguments for an inline (meta-spell) cast — the spell is provided as a string.
 */
interface InlineCastArgsInput extends BaseCastArgsInput {
  metaSpell: string;
  systemPromptFile?: never;
  userPrompt?: never;
}

/**
 * Arguments for a file-based cast — the spell is loaded from a system prompt file.
 */
interface FileCastArgsInput extends BaseCastArgsInput {
  metaSpell?: never;
  systemPromptFile: string;
  userPrompt: string;
}

/**
 * Union of valid cast argument inputs — either inline or file-based.
 */
export type CastArgsInput = InlineCastArgsInput | FileCastArgsInput;

/**
 * Build command-line arguments for the cast CLI.
 * Normalizes model ID, effort, and vault path into the forging CLI's expected format.
 */
export function buildCastArgs(input: CastArgsInput): string[] {
  const promptFlags: (string | undefined)[] = input.systemPromptFile
    ? ['--system-prompt-file', input.systemPromptFile, '-p', input.userPrompt]
    : ['-p', input.metaSpell];

  const args: string[] = [
    ...promptFlags.filter((v): v is string => v !== undefined),
    '--model',
    input.modelId,
    '--permission-mode',
    'dontAsk',
  ];

  if (input.effort !== null) {
    args.push('--effort', String(input.effort));
  }

  if (input.vaultMountPath !== '') {
    args.push('--add-dir', input.vaultMountPath);
  }

  return args;
}
