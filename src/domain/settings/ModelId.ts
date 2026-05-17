/**
 * Branded string type for Claude model identifiers (e.g. 'claude-sonnet-4-5').
 * @see SpellPath for the sibling brand pattern.
 */
export type ModelId = string & { readonly __brand: 'ModelId' };

/**
 * Safe constructor for ModelId brand.
 */
export function modelId(value: string): ModelId {
  return value as ModelId;
}
