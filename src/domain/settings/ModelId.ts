/**
 * Branded string type for Claude model identifiers (e.g. 'sonnet', 'opus', 'haiku').
 * @see SpellPath for the sibling brand pattern.
 */
export type ModelId = string & { readonly __brand: 'ModelId' };

/**
 * Safe constructor for ModelId brand.
 */
export function modelId(value: string): ModelId {
  return value as ModelId;
}
