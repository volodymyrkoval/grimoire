/**
 * Sanitises spell names for use as Markdown filenames by removing and collapsing invalid characters.
 * Removes filesystem-reserved chars and control chars, collapses runs of dashes, strips leading/trailing dashes.
 * May return an empty string if the input becomes empty after sanitisation.
 */
export function sanitiseSpellName(input: string): string {
  // eslint-disable-next-line no-control-regex
  const replaced = input.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  const trimmed = replaced.trim();
  const collapsed = trimmed.replace(/-+/g, "-");
  const finalTrimmed = collapsed.replace(/^-+|-+$/g, "");
  return finalTrimmed;
}
