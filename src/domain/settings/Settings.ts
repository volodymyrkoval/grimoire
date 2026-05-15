/** Execution effort level, mapped to model-specific parameter ranges. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Whether casts are executed locally or sent to a remote portal. */
export type ExecutionMode = 'local' | 'remote';

/** Plugin settings persisted to the Obsidian data store. */
export interface GrimoireSettings {
  spellTag: string;
  cliCommand: string;
  binaryPath: string;
  forgeOutputFolder: string;
  vaultMountPath: string;
  defaultModel: string;
  defaultEffort: Effort | null;
  executionMode: ExecutionMode;
  portalHost: string;
  portalPort: string;
  portalPath: string;
  portalAuthUser: string;
  portalAuthPassword: string;
}

/** Per-spell model and effort overrides that take precedence over global settings. */
export interface SpellOverride {
  model: string;
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
  forgeOutputFolder: 'Spells/',
  vaultMountPath: '',
  defaultModel: 'claude-sonnet-4-5',
  defaultEffort: 'medium',
  executionMode: 'local',
  portalHost: '',
  portalPort: '',
  portalPath: '',
  portalAuthUser: '',
  portalAuthPassword: '',
};

/** Metadata for a model supported by the Claude API, including its effort parameter support. */
export interface SupportedModel {
  id: string;
  label: string;
  effortOptions: readonly Effort[] | null;
  defaultEffort: Effort | null;
}

/** Hardcoded list of models available for selection in forms and casts. */
export const SUPPORTED_MODELS: readonly SupportedModel[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', effortOptions: null, defaultEffort: null },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', effortOptions: ['low', 'medium', 'high', 'max'], defaultEffort: 'medium' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', effortOptions: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'xhigh' },
];
