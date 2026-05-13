import { EXECUTE_ON_NOTE_KEY } from '../domain/spells/Spell';
import { Effort } from '../domain/settings/Settings';

export interface MetaSpellInput {
  description: string;
  name: string;
  model: string;
  effort: Effort | null;
  spellTag: string;
  forgeOutputFolder: string;
  vaultMountPath: string;
  executeOnNote: boolean;
}

export function buildMetaSpell(input: MetaSpellInput): string {
  const { description, name, model, effort, spellTag, forgeOutputFolder, vaultMountPath, executeOnNote } = input;
  const effortDisplay = effort ?? 'n/a';

  return `%%
## Execution Mode

> [!danger] IMMEDIATE EXECUTION — NO QUESTIONS
> When triggered, execute the full workflow immediately.
> **Do not** ask questions, offer options, or wait for confirmation.
> **Do not** ask for permission to use tools — all required tools are pre-authorized.
> Proceed directly with tool calls.

## MCP Tools

Use the available Obsidian MCP tools to read and write vault files. If they are unavailable or broken, fall back to standard file system tools using the vault path from the \`VAULT_MOUNT_PATH\` environment variable (${vaultMountPath}).
%%

---

**Forge inputs:**
- **Description:** ${description}
- **Name (already sanitised):** ${name}
- **Model:** ${model}
- **Effort:** ${effortDisplay}

You are forging a new spell. A spell is a system prompt for Claude Code, stored as a Markdown note in the vault.

Then execute in order:

1. Generate a complete, actionable spell body that fulfils the description. Write it as a clear Claude Code system prompt in imperative style.

2. Wrap the spell body in the standard Spell Wrapper structure — the same \`%%\` block format as this file:
   - Opening \`%%\` block containing: \`## Execution Mode\` (with the IMMEDIATE EXECUTION — NO QUESTIONS danger callout), and \`## MCP Tools\` (prefer Obsidian MCP, fall back to VAULT_MOUNT_PATH filesystem)
   - A \`---\` separator
   - The spell body
   - A \`---\` separator
   - Closing \`%%\` block containing only \`Begin execution now.\`

3. Set the file's YAML frontmatter \`tags\` field to \`[${spellTag}]\` and add \`${EXECUTE_ON_NOTE_KEY}: ${executeOnNote}\`.

4. Determine the output path: \`${forgeOutputFolder}${name}.md\`. Create the folder if it does not exist.

5. Write the file. Use Obsidian MCP write tools if available, otherwise write via the filesystem path under VAULT_MOUNT_PATH. If \`${forgeOutputFolder}${name}.md\` already exists, try \`${name}-2.md\`, then \`${name}-3.md\`, and so on until a free name is found.

---

%%
Begin execution now.`;
}
