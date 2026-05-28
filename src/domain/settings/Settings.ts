import { modelId, type ModelId } from './ModelId';
import { CLAUDE_CODE, type Provider } from './Provider';

/** Execution effort level, mapped to model-specific parameter ranges. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Whether casts are executed locally or sent to a remote portal. */
export type ExecutionMode = 'local' | 'remote';

/** Plugin settings persisted to the Obsidian data store. */
export interface GrimoireSettings {
  spellTag: string;
  cliCommand: string;
  binaryPath: string;
  /** Absolute or relative path to a dedicated MCP config file. When non-empty (after trim),
   *  local casts append `--mcp-config <path> --strict-mcp-config` to `claude -p`, making
   *  the cast's MCP server set exactly what the file declares (ignoring all configured
   *  scopes). When empty, both flags are omitted and casts inherit ambient MCP state.
   *  Passed verbatim — no expansion, no validation. */
  mcpConfigPath: string;
  forgeOutputFolder: string;
  vaultMountPath: string;
  defaultModel: ModelId;
  defaultProvider: Provider;
  defaultEffort: Effort | null;
  executionMode: ExecutionMode;
  portalHost: string;
  portalPort: string;
  portalPath: string;
  portalAuthUser: string;
  portalAuthPassword: string;
  /** Vault-relative path of the user's active Refine spell template; null = bundled default. */
  activeRefinePath: string | null;
  /** Whether to display cast output in the console. */
  showCastOutput: boolean;
}

/** Per-spell model and effort overrides that take precedence over global settings. */
export interface SpellOverride {
  model: ModelId;
  effort: Effort;
}

/** Plugin state envelope: settings + spell-level overrides. */
export interface GrimoireData {
  settings: GrimoireSettings;
  spellOverrides: Record<string, SpellOverride>;
}

/** Default plugin settings when no data has been saved. */
export const DEFAULT_SETTINGS: GrimoireSettings = {
  spellTag: 'grimoire/spell',
  cliCommand: 'claude',
  binaryPath: '',
  mcpConfigPath: '',
  forgeOutputFolder: 'Spells/',
  vaultMountPath: '',
  defaultModel: modelId('claude-sonnet-4-5'),
  defaultProvider: CLAUDE_CODE,
  defaultEffort: 'medium',
  executionMode: 'local',
  portalHost: '',
  portalPort: '',
  portalPath: '',
  portalAuthUser: '',
  portalAuthPassword: '',
  activeRefinePath: null,
  showCastOutput: false,
};

/** Metadata for a model supported by the Claude API, including its effort parameter support. */
export interface SupportedModel {
  id: ModelId;
  label: string;
  provider: Provider;
  effortOptions: readonly Effort[] | null;
  defaultEffort: Effort | null;
}

/** Hardcoded list of models available for selection in forms and casts. */
export const SUPPORTED_MODELS: readonly SupportedModel[] = [
  { id: modelId('claude-haiku-4-5'), label: 'Claude Haiku 4.5', provider: CLAUDE_CODE, effortOptions: null, defaultEffort: null },
  { id: modelId('claude-sonnet-4-5'), label: 'Claude Sonnet 4.5', provider: CLAUDE_CODE, effortOptions: ['low', 'medium', 'high', 'max'], defaultEffort: 'medium' },
  { id: modelId('claude-opus-4-5'), label: 'Claude Opus 4.5', provider: CLAUDE_CODE, effortOptions: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'xhigh' },
];
