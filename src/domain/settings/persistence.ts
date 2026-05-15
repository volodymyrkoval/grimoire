import { App } from 'obsidian';
import { DEFAULT_SETTINGS, Effort, GrimoireData, GrimoireSettings, SpellOverride } from './Settings';
import { computeVaultMountDefault } from './computeVaultMountDefault';

const VALID_EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Merges saved plugin data with defaults, validates effort enums, and computes missing vault paths.
 * Returns a complete GrimoireData object safe to use throughout the plugin.
 */
export function hydrate(saved: unknown, app: App): GrimoireData {
  const s = saved as
    | { settings?: Partial<GrimoireSettings>; spellOverrides?: Record<string, SpellOverride> }
    | undefined;
  const merged: GrimoireSettings = Object.assign({}, DEFAULT_SETTINGS, s?.settings);
  if (merged.vaultMountPath === '') {
    merged.vaultMountPath = computeVaultMountDefault(app);
  }
  if (merged.defaultEffort !== null && !VALID_EFFORTS.includes(merged.defaultEffort)) {
    merged.defaultEffort = 'medium';
  }
  return {
    settings: merged,
    spellOverrides: s?.spellOverrides ?? {},
  };
}
