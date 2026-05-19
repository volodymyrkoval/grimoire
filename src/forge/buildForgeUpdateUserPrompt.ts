import { Effort } from '../domain/settings/Settings';
import type { SpellPath } from '../domain/spells/SpellPath';
import type { Hotkey } from '../domain/spells/Hotkey';

export interface ForgeUpdateUserPromptInput {
  readonly spellPath: SpellPath;
  readonly spellName: string;
  readonly description: string;
  readonly applyCastDirectives: boolean;
  readonly directiveCount: number;
  readonly model: string;
  readonly effort: Effort | null;
  readonly hotkey: Hotkey | null;
}

/** Builds the per-update user prompt carrying the forge-update inputs. Pure function; no I/O. */
export function buildForgeUpdateUserPrompt(input: ForgeUpdateUserPromptInput): string {
  const { spellPath, spellName, description, applyCastDirectives, directiveCount, model, effort, hotkey } = input;
  const effortDisplay = effort ?? 'n/a';

  const castDirectiveInstruction = applyCastDirectives
    ? '- **@cast directive instruction:** Remove all `@cast` lines from the spell body after applying them.'
    : '- **@cast directive instruction:** Preserve all `@cast` lines in the spell body — do not remove them.';

  return `Follow the workflow in your system prompt for these update inputs:

- **Spell path:** ${spellPath}
- **Spell name:** ${spellName}
- **Model:** ${model}
- **Effort:** ${effortDisplay}
- **Apply @cast directives:** ${applyCastDirectives}
${castDirectiveInstruction}
- **Directive count:** ${directiveCount}
- **Hotkey:** ${hotkey ?? 'none'}

**Description:**
> ${description}`;
}
