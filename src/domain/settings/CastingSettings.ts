import { modelId, type ModelId } from './ModelId';
import type { Effort } from './Settings';
import { CLAUDE_CODE, parseProvider as parseProviderBrand, type Provider } from './Provider';

/**
 * YAML frontmatter key for spell-local casting settings.
 * @example 'grimoire-casting'
 */
export const CASTING_FRONTMATTER_KEY = 'grimoire-casting' as const;

/**
 * Standard casting provider identifier for claude-code CLI.
 */
export const CLAUDE_CODE_PROVIDER = CLAUDE_CODE;

/**
 * Spell-local casting configuration, typically stored in YAML frontmatter.
 * Overrides global settings for a specific spell.
 */
export interface SpellCastingSettings {
  provider: Provider;
  model: ModelId;
  effort?: Effort;
}

/**
 * Checks if a value is a plain object (non-null, non-array, object literal).
 */
function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
}

/**
 * Extracts and validates the provider field from an object.
 * Returns a branded Provider if valid and known, else null.
 */
function parseProviderField(obj: Record<string, unknown>): Provider | null {
  const provider = obj.provider;
  if (typeof provider !== 'string') {
    return null;
  }
  return parseProviderBrand(provider);
}

/**
 * Extracts and validates the model field from an object.
 * Returns a branded ModelId if the model string is non-empty, else null.
 */
function parseModel(obj: Record<string, unknown>): ModelId | null {
  const model = obj.model;
  if (typeof model !== 'string') {
    return null;
  }
  return model.length > 0 ? modelId(model) : null;
}

/**
 * Extracts and validates the effort field from an object.
 * Returns the effort if it is one of the valid Effort literals, else undefined.
 * Undefined is returned for both missing and invalid efforts (absence is valid).
 */
function parseEffort(obj: Record<string, unknown>): Effort | undefined {
  const effort = obj.effort;
  const validEfforts: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
  if (effort !== undefined && validEfforts.includes(effort as Effort)) {
    return effort as Effort;
  }
  return undefined;
}

/**
 * Parses raw input (typically from YAML frontmatter) into SpellCastingSettings.
 * Returns null if provider or model is invalid; effort absence/invalidity is silently dropped.
 * Never throws.
 */
export function parseCastingSettings(raw: unknown): SpellCastingSettings | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const provider = parseProviderField(raw);
  if (provider === null) {
    return null;
  }

  const model = parseModel(raw);
  if (model === null) {
    return null;
  }

  const effort = parseEffort(raw);

  return {
    provider,
    model,
    effort,
  };
}
