export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ExecutionMode = 'local' | 'remote';

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

export interface SpellOverride {
  model: string;
  effort: Effort;
}

export interface GrimoireData {
  settings: GrimoireSettings;
  spellOverrides: Record<string, SpellOverride>;
}

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

export interface SupportedModel {
  id: string;
  label: string;
  effortOptions: readonly Effort[] | null;
  defaultEffort: Effort | null;
}

export const SUPPORTED_MODELS: readonly SupportedModel[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', effortOptions: null, defaultEffort: null },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', effortOptions: ['low', 'medium', 'high', 'max'], defaultEffort: 'medium' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', effortOptions: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'xhigh' },
];
