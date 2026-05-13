import { Effort } from "../domain/settings/Settings";

interface BaseCastArgsInput {
  modelId: string;
  effort: Effort | null;
  vaultMountPath: string;
  castSettingsPath: string;
}

interface InlineCastArgsInput extends BaseCastArgsInput {
  metaSpell: string;
  systemPromptFile?: never;
  userPrompt?: never;
}

interface FileCastArgsInput extends BaseCastArgsInput {
  metaSpell?: never;
  systemPromptFile: string;
  userPrompt: string;
}

export type CastArgsInput = InlineCastArgsInput | FileCastArgsInput;

export function buildCastArgs(input: CastArgsInput): string[] {
  const promptFlags: (string | undefined)[] = input.systemPromptFile
    ? ["--system-prompt-file", input.systemPromptFile, "-p", input.userPrompt]
    : ["-p", input.metaSpell];

  const args: string[] = [
    ...promptFlags.filter((v): v is string => v !== undefined),
    "--model",
    input.modelId,
    "--permission-mode",
    "dontAsk",
  ];

  if (input.effort !== null) {
    args.push("--effort", input.effort);
  }

  if (input.vaultMountPath !== "") {
    args.push("--add-dir", input.vaultMountPath);
  }

  // --settings is always emitted; empty value lets Claude Code fall back to user settings.
  args.push("--settings", input.castSettingsPath);

  return args;
}
