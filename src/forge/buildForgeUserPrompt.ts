import { Effort } from '../domain/settings/Settings';

export interface ForgeUserPromptInput {
  readonly description: string;
  readonly name: string;
  readonly model: string;
  readonly effort: Effort | null;
  readonly executeOnNote: boolean;
}

/** Builds the small per-cast user prompt carrying the five forge inputs. Pure function; no I/O. */
export function buildForgeUserPrompt(input: ForgeUserPromptInput): string {
  const { description, name, model, effort, executeOnNote } = input;
  const effortDisplay = effort ?? 'n/a';

  return `Follow the workflow in your system prompt for these inputs:

- **Description:** ${description}
- **Name:** ${name}
- **Model:** ${model}
- **Effort:** ${effortDisplay}
- **Execute on note:** ${executeOnNote}`;
}
