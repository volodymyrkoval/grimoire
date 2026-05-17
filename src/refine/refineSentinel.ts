/**
 * Frontmatter key and value used to identify custom Refine spell templates.
 * The single discovery mechanism: a note is a Refine template iff it contains
 * `sentinel: refine` in its YAML frontmatter.
 */

/**
 * Frontmatter key for template discovery.
 * This is the single discovery mechanism per the pitch's no-go on naming or tagging conventions.
 */
export const SENTINEL_FRONTMATTER_KEY = 'sentinel' as const;

/**
 * Frontmatter value that marks a note as a custom Refine spell template.
 * When found alongside SENTINEL_FRONTMATTER_KEY, indicates the note should be treated as a Refine template.
 */
export const REFINE_SENTINEL_FRONTMATTER_VALUE = 'refine' as const;
